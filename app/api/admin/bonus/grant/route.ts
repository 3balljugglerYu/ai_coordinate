import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/admin-audit";

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
    const { user_id, amount, reason, send_notification = true } = body;

    // バリデーション: user_id
    if (!user_id || typeof user_id !== "string" || user_id.trim() === "") {
      return NextResponse.json(
        { error: "user_id is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // UUID形式のバリデーション
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(user_id.trim())) {
      return NextResponse.json(
        { error: "user_id must be a valid UUID format" },
        { status: 400 }
      );
    }

    // バリデーション: amount
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

    // バリデーション: reason
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

    // バリデーション: send_notification
    if (typeof send_notification !== "boolean") {
      return NextResponse.json(
        { error: "send_notification must be a boolean" },
        { status: 400 }
      );
    }

    // RPC関数呼び出し
    const supabase = await createClient();
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "grant_admin_bonus",
      {
        p_user_id: user_id.trim(),
        p_amount: amount,
        p_reason: reason.trim(),
        p_admin_id: admin.id,
        p_send_notification: send_notification,
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

    // 新しい残高を取得
    const { data: creditData, error: creditError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user_id.trim())
      .single();

    if (creditError || !creditData) {
      console.error("[Admin Bonus] Failed to fetch new balance:", creditError);
      await logAdminAction({
        adminUserId: admin.id,
        actionType: "bonus_grant",
        targetType: "user",
        targetId: user_id.trim(),
        metadata: { amount: amount_granted, reason: reason.trim(), transaction_id },
      });
      return NextResponse.json({
        success: true,
        amount_granted,
        transaction_id,
        message: "ボーナスが付与されました（残高の取得に失敗しました）",
      });
    }

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "bonus_grant",
      targetType: "user",
      targetId: user_id.trim(),
      metadata: { amount: amount_granted, reason: reason.trim(), transaction_id },
    });

    return NextResponse.json({
      success: true,
      new_balance: creditData.balance,
      transaction_id,
      amount_granted,
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
