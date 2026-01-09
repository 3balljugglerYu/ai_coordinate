import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 初回ログイン時の紹介特典チェックAPI
 * メールアドレス確認完了後の初回ログイン成功時に呼び出される
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          error: "認証が必要です",
        },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "check_and_grant_referral_bonus_on_first_login",
      {
        p_user_id: user.id,
      }
    );

    if (rpcError) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("[Referral Bonus] RPC error:", rpcError);
      return NextResponse.json(
        {
          bonus_granted: 0,
          error: "紹介特典の確認に失敗しました",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bonus_granted: typeof data === "number" ? data : 0,
    });
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Referral Bonus] Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        error:
          error instanceof Error
            ? error.message
            : "紹介特典の確認に失敗しました",
      },
      { status: 500 }
    );
  }
}

