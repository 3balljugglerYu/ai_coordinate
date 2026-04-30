import { connection, NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getJstDateString,
  isStreakBroken,
} from "@/features/challenges/lib/streak-utils";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getStreakRouteCopy } from "@/features/challenges/lib/streak-route-copy";

type StreakStatus = {
  streak_days: number | null;
  checked_in_today: boolean;
  last_streak_login_at: string | null;
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
      last_streak_login_at: null,
    };
  }

  let streakDays = profile?.streak_days ?? null;
  const lastStreakLoginAt = profile?.last_streak_login_at ?? null;
  const checkedInToday =
    lastStreakLoginAt !== null &&
    getJstDateString(new Date(lastStreakLoginAt)) ===
      getJstDateString(new Date());

  // 継続条件外（2日以上空いた）の場合は表示用に 0 を返す（DB は更新しない・GET は副作用なし）
  // 実際のリセットはチェックイン時（POST）の grant_streak_bonus で行う
  if (isStreakBroken(lastStreakLoginAt) && streakDays !== null && streakDays > 0) {
    streakDays = 0;
  }

  return {
    streak_days: streakDays,
    checked_in_today: checkedInToday,
    last_streak_login_at: lastStreakLoginAt,
  };
}

/**
 * ストリーク（連続ログイン）特典チェックインAPI
 * GET: 状態取得のみ（副作用なし）。継続条件外の場合は表示用に streak_days: 0 を返す
 * POST: 特典付与を実行する
 */
export async function GET(request: NextRequest) {
  await connection();
  const copy = getStreakRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          streak_days: null,
          checked_in_today: false,
          last_streak_login_at: null,
          error: copy.authRequired,
          errorCode: "STREAK_AUTH_REQUIRED",
        },
        { status: 401 }
      );
    }

    const status = await getStreakStatus(user.id);
    return NextResponse.json({
      bonus_granted: 0,
      streak_days: status.streak_days,
      checked_in_today: status.checked_in_today,
      last_streak_login_at: status.last_streak_login_at,
    });
  } catch (error) {
    console.error("[Streak Bonus] GET Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        streak_days: null,
        checked_in_today: false,
        last_streak_login_at: null,
        error: copy.streakStatusFailed,
        errorCode: "STREAK_STATUS_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const copy = getStreakRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();

    // 未認証の場合はエラーレスポンスを返す（リダイレクトではなく）
    if (!user) {
      return NextResponse.json(
        {
          bonus_granted: 0,
          streak_days: null,
          checked_in_today: false,
          last_streak_login_at: null,
          error: copy.authRequired,
          errorCode: "STREAK_AUTH_REQUIRED",
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
          last_streak_login_at: null,
          error: copy.streakBonusFailed,
          errorCode: "STREAK_BONUS_CHECK_FAILED",
        },
        { status: 500 }
      );
    }

    const status = await getStreakStatus(user.id);

    revalidateTag(`challenge-${user.id}`, "max");
    revalidateTag(`my-page-${user.id}`, "max");
    revalidateTag(`my-page-credits-${user.id}`, "max");
    revalidateTag(`coordinate-${user.id}`, "max");
    return NextResponse.json({
      bonus_granted: typeof data === "number" ? data : 0,
      streak_days: status.streak_days,
      checked_in_today: status.checked_in_today,
      last_streak_login_at: status.last_streak_login_at,
    });
  } catch (error) {
    // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
    console.error("[Streak Bonus] POST Exception:", error);
    return NextResponse.json(
      {
        bonus_granted: 0,
        streak_days: null,
        checked_in_today: false,
        last_streak_login_at: null,
        error: copy.streakBonusFailed,
        errorCode: "STREAK_BONUS_CHECK_FAILED",
      },
      { status: 500 }
    );
  }
}
