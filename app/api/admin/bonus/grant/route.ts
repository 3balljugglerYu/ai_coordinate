import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
    const { data, error: rpcError } = await supabase.rpc(
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

    // 付与されたペルコイン数を確認
    if (typeof data !== "number" || data !== amount) {
      console.error("[Admin Bonus] Unexpected RPC return value:", data);
      return NextResponse.json(
        {
          error: "ボーナス付与の処理に失敗しました",
        },
        { status: 500 }
      );
    }

    // 新しい残高を取得
    const { data: creditData, error: creditError } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user_id.trim())
      .single();

    if (creditError || !creditData) {
      console.error("[Admin Bonus] Failed to fetch new balance:", creditError);
      // 残高取得に失敗しても、RPC関数は成功しているので、付与されたペルコイン数だけ返す
      return NextResponse.json({
        success: true,
        amount_granted: data,
        message: "ボーナスが付与されました（残高の取得に失敗しました）",
      });
    }

    // 最新のトランザクションIDを取得
    const { data: transactionData, error: transactionError } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("user_id", user_id.trim())
      .eq("transaction_type", "admin_bonus")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (transactionError || !transactionData) {
      console.error(
        "[Admin Bonus] Failed to fetch transaction ID:",
        transactionError
      );
      // トランザクションID取得に失敗しても、RPC関数は成功しているので、残高だけ返す
      return NextResponse.json({
        success: true,
        new_balance: creditData.balance,
        amount_granted: data,
      });
    }

    // 成功レスポンス
    return NextResponse.json({
      success: true,
      new_balance: creditData.balance,
      transaction_id: transactionData.id,
      amount_granted: data,
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
