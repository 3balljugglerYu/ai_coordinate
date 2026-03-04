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

const adminDeductionSchema = z.object({
  user_id: z
    .string()
    .trim()
    .min(1, "ユーザーIDを入力してください")
    .uuid("ユーザーIDはUUID形式で入力してください"),
  amount: z
    .number()
    .int("減算ペルコイン数は1以上の整数で入力してください")
    .min(1, "減算ペルコイン数は1以上の整数で入力してください"),
  balance_type: z.enum(ADMIN_PERCOIN_BALANCE_TYPES),
  reason: z
    .string()
    .trim()
    .min(1, "減算理由を入力してください")
    .max(500, "減算理由は500文字以内で入力してください"),
  idempotency_key: z
    .string()
    .trim()
    .min(1, "リクエスト識別子が必要です"),
});

const DEDUCTION_CONFLICT_DETAILS = new Set([
  "INSUFFICIENT_UNLIMITED_PERCOIN",
  "INSUFFICIENT_PERIOD_LIMITED_PERCOIN",
]);

const LEGACY_DEDUCTION_CONFLICT_MESSAGES = new Set([
  "ユーザーが保有している無期限のペルコインが、設定したペルコイン数より少ないです。",
  "ユーザーが保有している期間限定のペルコインが、設定したペルコイン数より少ないです。",
]);

function getDeductionValidationError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (firstIssue?.path[0] === "user_id") {
    return firstIssue.message.includes("UUID")
      ? "ユーザーIDはUUID形式で入力してください"
      : "ユーザーIDを入力してください";
  }
  if (firstIssue?.path[0] === "amount") {
    return "減算ペルコイン数は1以上の整数で入力してください";
  }
  if (firstIssue?.path[0] === "balance_type") {
    return "減算対象を選択してください";
  }
  if (firstIssue?.path[0] === "reason") {
    return firstIssue.message.includes("500")
      ? "減算理由は500文字以内で入力してください"
      : "減算理由を入力してください";
  }
  if (firstIssue?.path[0] === "idempotency_key") {
    return "リクエスト識別子が必要です";
  }
  return firstIssue?.message ?? "入力内容が不正です";
}

function isDeductionConflictError(error: {
  code?: string;
  details?: string | null;
  message?: string;
}): boolean {
  return (
    error.code === "P0001" &&
    (
      (typeof error.details === "string" &&
        DEDUCTION_CONFLICT_DETAILS.has(error.details)) ||
      (typeof error.message === "string" &&
        LEGACY_DEDUCTION_CONFLICT_MESSAGES.has(error.message))
    )
  );
}

/**
 * ペルコイン減算API
 * 管理者が特定ユーザーからペルコインを手動で減算する（Stripe返金・訂正等）
 */
export async function POST(request: NextRequest) {
  try {
    let admin;
    try {
      admin = await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const body = await request.json();
    const parsed = adminDeductionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: getDeductionValidationError(parsed.error) },
        { status: 400 }
      );
    }

    const { user_id, amount, balance_type, reason, idempotency_key } =
      parsed.data;
    const idempotencyKey = idempotency_key;
    const supabase = createAdminClient();
    const balanceTypeLabel = getAdminPercoinBalanceTypeLabel(balance_type);

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "deduct_percoins_admin",
      {
        p_user_id: user_id,
        p_amount: amount,
        p_balance_type: balance_type,
        p_idempotency_key: idempotencyKey,
        p_metadata: {
          reason,
          admin_id: admin.id,
        },
      }
    );

    if (rpcError) {
      console.error("[Admin Deduction] RPC error:", rpcError);
      return NextResponse.json(
        {
          error: rpcError.message || "ペルコイン減算に失敗しました",
        },
        { status: isDeductionConflictError(rpcError) ? 409 : 500 }
      );
    }

    if (
      !Array.isArray(rpcResult) ||
      rpcResult.length === 0 ||
      !rpcResult[0]
    ) {
      console.error("[Admin Deduction] Unexpected RPC return value:", rpcResult);
      return NextResponse.json(
        {
          error: "ペルコイン減算の処理に失敗しました",
        },
        { status: 500 }
      );
    }

    const { balance: new_balance, amount_deducted } = rpcResult[0];
    const targetUserId = user_id;

    if (amount_deducted === 0) {
      return NextResponse.json({
        success: true,
        new_balance,
        amount_deducted,
        message: "同じリクエストはすでに処理済みです。",
      });
    }

    revalidateTag(`my-page-${targetUserId}`, "max");
    revalidateTag(`my-page-credits-${targetUserId}`, "max");
    revalidateTag(`coordinate-${targetUserId}`, "max");
    revalidateTag(`challenge-${targetUserId}`, "max");

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "deduction",
      targetType: "user",
      targetId: targetUserId,
      metadata: { amount: amount_deducted, reason, balance_type },
    });

    return NextResponse.json({
      success: true,
      new_balance,
      amount_deducted,
      message: `${balanceTypeLabel}から${amount_deducted}ペルコインを減算しました。新しい残高: ${new_balance}ペルコイン`,
    });
  } catch (error) {
    console.error("[Admin Deduction] Exception:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ペルコイン減算に失敗しました",
      },
      { status: 500 }
    );
  }
}
