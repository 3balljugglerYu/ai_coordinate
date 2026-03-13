import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  ADMIN_PERCOIN_BALANCE_TYPES,
  getAdminPercoinBalanceTypeLabel,
} from "@/features/credits/lib/admin-percoin-balance-type";

const MAX_BULK_GRANTS = 300;

const grantItemSchema = z.object({
  email: z.string().trim().min(1, "メールアドレスを入力してください"),
  amount: z
    .number()
    .int("付与ペルコイン数は1以上の整数で入力してください")
    .min(1, "付与ペルコイン数は1以上の整数で入力してください"),
});

const grantBatchSchema = z.object({
  grants: z
    .array(grantItemSchema)
    .min(1, "付与対象を1件以上入力してください")
    .max(MAX_BULK_GRANTS, `付与対象は${MAX_BULK_GRANTS}件以内で入力してください`),
  balance_type: z.enum(ADMIN_PERCOIN_BALANCE_TYPES),
  reason: z
    .string()
    .trim()
    .min(1, "付与理由を入力してください")
    .max(500, "付与理由は500文字以内で入力してください"),
  send_notification: z.boolean().default(true),
});

export const maxDuration = 60;

type GrantResult =
  | {
      email: string;
      status: "success";
      user_id: string;
      balance_before: number;
      amount_granted: number;
      balance_after: number;
    }
  | {
      email: string;
      status: "skipped";
      error: string;
    }
  | {
      email: string;
      status: "error";
      error: string;
    };

/**
 * ペルコイン一括付与API
 * メールアドレスと付与数を指定し、登録済みユーザーにペルコインを付与する
 */
export async function POST(request: NextRequest) {
  try {
    let admin;
    try {
      admin = await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) return error;
      throw error;
    }

    const body = await request.json();
    const parsed = grantBatchSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path?.[0];
      let message = "入力内容が不正です";
      if (path === "grants") message = firstIssue?.message ?? message;
      else if (path === "balance_type") message = "付与種別を選択してください";
      else if (path === "reason") message = firstIssue?.message ?? message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { grants, balance_type, reason, send_notification } = parsed.data;

    const supabase = createAdminClient();

    const emailToGrant = new Map<string, number>();
    for (const g of grants) {
      if (!emailToGrant.has(g.email)) {
        emailToGrant.set(g.email, g.amount);
      }
    }

    const { data: lookupRows, error: lookupError } = await supabase.rpc(
      "get_user_ids_by_emails",
      { p_emails: Array.from(emailToGrant.keys()) }
    );

    if (lookupError) {
      console.error("[Admin Bonus Grant Batch] Lookup error:", lookupError);
      return NextResponse.json(
        { error: "ユーザー検索に失敗しました" },
        { status: 500 }
      );
    }

    const emailToUser = new Map<
      string,
      { user_id: string; balance: number }
    >();
    for (const r of lookupRows ?? []) {
      const row = r as { email: string; user_id: string; balance: number };
      emailToUser.set(row.email, {
        user_id: row.user_id,
        balance: row.balance,
      });
    }

    const results: GrantResult[] = [];
    const processedUserIds = new Set<string>();

    for (const [email, amount] of emailToGrant) {
      const userInfo = emailToUser.get(email);
      if (!userInfo) {
        results.push({
          email,
          status: "skipped",
          error: "登録なし",
        });
        continue;
      }

      const { user_id, balance: balanceBefore } = userInfo;

      try {
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          "grant_admin_bonus",
          {
            p_user_id: user_id,
            p_amount: amount,
            p_reason: reason,
            p_admin_id: admin.id,
            p_send_notification: send_notification,
            p_balance_type: balance_type,
          }
        );

        if (rpcError) {
          results.push({
            email,
            status: "error",
            error: rpcError.message || "ペルコイン付与に失敗しました",
          });
          continue;
        }

        const arr = rpcResult as Array<{ amount_granted: number }>;
        if (
          !Array.isArray(arr) ||
          arr.length === 0 ||
          typeof arr[0]?.amount_granted !== "number"
        ) {
          results.push({
            email,
            status: "error",
            error: "ペルコイン付与の処理に失敗しました",
          });
          continue;
        }

        const { data: creditData, error: creditError } = await supabase
          .from("user_credits")
          .select("balance")
          .eq("user_id", user_id)
          .single();

        if (creditError) {
          throw new Error(
            `付与後の残高取得に失敗しました (user: ${user_id}): ${creditError.message}`
          );
        }

        const balanceAfter =
          (creditData as { balance: number } | null)?.balance ??
          balanceBefore + amount;

        if (!processedUserIds.has(user_id)) {
          processedUserIds.add(user_id);
          revalidateTag(`my-page-${user_id}`, "max");
          revalidateTag(`my-page-credits-${user_id}`, "max");
          revalidateTag(`coordinate-${user_id}`, "max");
          revalidateTag(`challenge-${user_id}`, "max");
        }

        results.push({
          email,
          status: "success",
          user_id,
          balance_before: balanceBefore,
          amount_granted: amount,
          balance_after: balanceAfter,
        });
      } catch (err) {
        console.error("[Admin Bonus Grant Batch] Grant error:", err);
        results.push({
          email,
          status: "error",
          error:
            err instanceof Error ? err.message : "ペルコイン付与に失敗しました",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "bonus_bulk_grant",
      targetType: "bulk",
      targetId: undefined,
      metadata: {
        total: results.length,
        success: successCount,
        skipped: skippedCount,
        error: errorCount,
        balance_type,
        reason,
      },
    });

    const balanceTypeLabel = getAdminPercoinBalanceTypeLabel(balance_type);
    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        success: successCount,
        skipped: skippedCount,
        error: errorCount,
      },
      message: `${balanceTypeLabel}で${successCount}件のペルコイン付与を完了しました。スキップ: ${skippedCount}件、エラー: ${errorCount}件`,
    });
  } catch (error) {
    console.error("[Admin Bonus Grant Batch] Exception:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "一括ペルコイン付与に失敗しました",
      },
      { status: 500 }
    );
  }
}
