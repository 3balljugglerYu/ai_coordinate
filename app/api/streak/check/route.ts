import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const getJstDateString = (date: Date) =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

type StreakStatus = {
  streak_days: number | null;
  checked_in_today: boolean;
};

async function getStreakStatus(userId: string): Promise<StreakStatus> {
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("streak_days, last_streak_login_at")
    .eq("user_id", userId)
    .single();

  if (profileError) {
    console.error("[Streak Bonus] Failed to fetch streak status:", profileError);
    return {
      streak_days: null,
      checked_in_today: false,
    };
  }

  const streakDays = profile?.streak_days ?? null;
  const lastStreakLoginAt = profile?.last_streak_login_at ?? null;
  const checkedInToday =
    lastStreakLoginAt !== null &&
    getJstDateString(new Date(lastStreakLoginAt)) ===
      getJstDateString(new Date());

  return {
    streak_days: streakDays,
    checked_in_today: checkedInToday,
  };
}

/**
 * ストリーク（連続ログイン）特典チェックインAPI
 * GETは状態取得のみ（副作用なし）
 * POSTでのみ特典付与を実行する
 */
export async function GET() {
  try {
    const user = await getUser();

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          streak_days: null,
          checked_in_today: false,
          error: "認証が必要です",
        },
        { status: 401 }
      );
    }

    const status = await getStreakStatus(user.id);
    return NextResponse.json({
      bonus_granted: 0,
      streak_days: status.streak_days,
      checked_in_today: status.checked_in_today,
    });
  } catch (error) {
    console.error("[Streak Bonus] GET Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        streak_days: null,
        checked_in_today: false,
        error:
          error instanceof Error
            ? error.message
            : "特典ステータスの取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const user = await getUser();

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          streak_days: null,
          checked_in_today: false,
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
          checked_in_today: false,
          error: "特典の確認に失敗しました",
        },
        { status: 500 }
      );
    }

    const status = await getStreakStatus(user.id);

    return NextResponse.json({
      bonus_granted: typeof data === "number" ? data : 0,
      streak_days: status.streak_days,
      checked_in_today: status.checked_in_today,
    });
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Streak Bonus] POST Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        streak_days: null,
        checked_in_today: false,
        error:
          error instanceof Error
            ? error.message
            : "特典の確認に失敗しました",
      },
      { status: 500 }
    );
  }
}
