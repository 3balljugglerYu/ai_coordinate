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

const grantAdminBonusSchema = z.object({
  user_id: z
    .string()
    .trim()
    .min(1, "ユーザーIDを入力してください")
    .uuid("ユーザーIDはUUID形式で入力してください"),
  amount: z
    .number()
    .int("付与ペルコイン数は1以上の整数で入力してください")
    .min(1, "付与ペルコイン数は1以上の整数で入力してください"),
  balance_type: z.enum(ADMIN_PERCOIN_BALANCE_TYPES),
  reason: z
    .string()
    .trim()
    .min(1, "付与理由を入力してください")
    .max(500, "付与理由は500文字以内で入力してください"),
  send_notification: z.boolean().default(true),
});

function getGrantValidationError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (firstIssue?.path[0] === "user_id") {
    return firstIssue.message.includes("UUID")
      ? "ユーザーIDはUUID形式で入力してください"
      : "ユーザーIDを入力してください";
  }
  if (firstIssue?.path[0] === "amount") {
    return "付与ペルコイン数は1以上の整数で入力してください";
  }
  if (firstIssue?.path[0] === "balance_type") {
    return "付与種別を選択してください";
  }
  if (firstIssue?.path[0] === "reason") {
    return firstIssue.message.includes("500")
      ? "付与理由は500文字以内で入力してください"
      : "付与理由を入力してください";
  }
  return firstIssue?.message ?? "入力内容が不正です";
}

/**
 * 運営者からのボーナス付与API
 * 管理者が特定ユーザーにペルコインを手動で付与する
 */
export async function POST(request: NextRequest) {
  try {
    // 管理者権限チェック
    let admin;
    try {
      admin = await requireAdmin();
    } catch (error) {
      // NextResponseインスタンスの場合はそのまま返す
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    // リクエストボディの解析
    const body = await request.json();
    const parsed = grantAdminBonusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: getGrantValidationError(parsed.error) },
        { status: 400 }
      );
    }

    const { user_id, amount, balance_type, reason, send_notification } =
      parsed.data;

    // RPC関数呼び出し（service_role 使用: DB層の認可チェックで auth.uid() IS NULL を許可）
    const supabase = createAdminClient();
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
      console.error("[Admin Bonus] RPC error:", rpcError);
      return NextResponse.json(
        {
          error: rpcError.message || "ボーナス付与に失敗しました",
        },
        { status: 500 }
      );
    }

    // RPC関数の返り値を確認（TABLE型なので配列で返る）
    if (
      !Array.isArray(rpcResult) ||
      rpcResult.length === 0 ||
      !rpcResult[0] ||
      typeof rpcResult[0].amount_granted !== "number" ||
      rpcResult[0].amount_granted !== amount
    ) {
      console.error("[Admin Bonus] Unexpected RPC return value:", rpcResult);
      return NextResponse.json(
        {
          error: "ボーナス付与の処理に失敗しました",
        },
        { status: 500 }
      );
    }

    const { amount_granted, transaction_id } = rpcResult[0];
    const balanceTypeLabel = getAdminPercoinBalanceTypeLabel(balance_type);

    // 新しい残高を取得（createAdminClient で RLS をバイパス）
    const { data: creditData, error: creditError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user_id)
      .single();

    const targetUserId = user_id;
    revalidateTag(`my-page-${targetUserId}`, "max");
    revalidateTag(`my-page-credits-${targetUserId}`, "max");
    revalidateTag(`coordinate-${targetUserId}`, "max");
    revalidateTag(`challenge-${targetUserId}`, "max");

    if (creditError || !creditData) {
      console.error("[Admin Bonus] Failed to fetch new balance:", creditError);
      await logAdminAction({
        adminUserId: admin.id,
        actionType: "bonus_grant",
        targetType: "user",
        targetId: user_id,
        metadata: {
          amount: amount_granted,
          reason,
          balance_type,
          transaction_id,
        },
      });
      return NextResponse.json({
        success: true,
        amount_granted,
        transaction_id,
        message: `${balanceTypeLabel}で${amount_granted}ペルコインを付与しました（残高の取得に失敗しました）`,
      });
    }

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "bonus_grant",
      targetType: "user",
      targetId: user_id,
      metadata: { amount: amount_granted, reason, balance_type, transaction_id },
    });

    return NextResponse.json({
      success: true,
      new_balance: creditData.balance,
      transaction_id,
      amount_granted,
      message: `${balanceTypeLabel}で${amount_granted}ペルコインを付与しました。新しい残高: ${creditData.balance}ペルコイン`,
    });
  } catch (error) {
    console.error("[Admin Bonus] Exception:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ボーナス付与に失敗しました",
      },
      { status: 500 }
    );
  }
}
