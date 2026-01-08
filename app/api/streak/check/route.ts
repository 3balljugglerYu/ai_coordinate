import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * ストリーク（連続ログイン）特典チェックAPI
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    
    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          streak_days: null,
          error: "認証が必要です",
        },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const { data, error: rpcError } = await supabase.rpc(
      "grant_streak_bonus",
      {
        p_user_id: user.id,
      }
    );

    if (rpcError) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("[Streak Bonus] RPC error:", rpcError);
      return NextResponse.json(
        {
          bonus_granted: 0,
          streak_days: null,
          error: "特典の確認に失敗しました",
        },
        { status: 500 }
      );
    }

    // 現在の連続ログイン日数を取得
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("streak_days")
      .eq("user_id", user.id)
      .single();

    const streakDays = profileError ? null : profile?.streak_days ?? null;

    return NextResponse.json({
      bonus_granted: typeof data === "number" ? data : 0,
      streak_days: streakDays,
    });
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Streak Bonus] Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        streak_days: null,
        error:
          error instanceof Error
            ? error.message
            : "特典の確認に失敗しました",
      },
      { status: 500 }
    );
  }
}

