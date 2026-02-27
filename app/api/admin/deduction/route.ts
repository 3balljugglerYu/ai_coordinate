import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const { user_id, amount, reason, idempotency_key } = body;

    if (!user_id || typeof user_id !== "string" || user_id.trim() === "") {
      return NextResponse.json(
        { error: "user_id is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!UUID_PATTERN.test(user_id.trim())) {
      return NextResponse.json(
        { error: "user_id must be a valid UUID format" },
        { status: 400 }
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount < 1
    ) {
      return NextResponse.json(
        { error: "amount must be an integer greater than or equal to 1" },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== "string" || reason.trim() === "") {
      return NextResponse.json(
        { error: "reason is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (reason.length > 500) {
      return NextResponse.json(
        { error: "reason must be 500 characters or less" },
        { status: 400 }
      );
    }

    if (
      !idempotency_key ||
      typeof idempotency_key !== "string" ||
      idempotency_key.trim() === ""
    ) {
      return NextResponse.json(
        { error: "idempotency_key is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const idempotencyKey = idempotency_key.trim();
    const supabase = createAdminClient();

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "deduct_percoins_admin",
      {
        p_user_id: user_id.trim(),
        p_amount: amount,
        p_idempotency_key: idempotencyKey,
        p_metadata: {
          reason: reason.trim(),
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
        { status: 500 }
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

    const targetUserId = user_id.trim();
    revalidateTag(`my-page-${targetUserId}`, "max");
    revalidateTag(`my-page-credits-${targetUserId}`, "max");
    revalidateTag(`coordinate-${targetUserId}`, "max");
    revalidateTag(`challenge-${targetUserId}`, "max");

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "deduction",
      targetType: "user",
      targetId: targetUserId,
      metadata: { amount: amount_deducted, reason: reason.trim() },
    });

    return NextResponse.json({
      success: true,
      new_balance,
      amount_deducted,
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
