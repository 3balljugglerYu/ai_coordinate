import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isStreakBroken } from "./streak-utils";

export interface ChallengeStatus {
  streakDays: number;
  lastStreakLoginAt: string | null;
  lastDailyPostBonusAt: string | null;
}

/**
 * ミッション関連のステータスを取得（サーバーサイド）
 * 連続チェックインが途切れている場合は streak_days を Day 1 相当（0）にリセットする
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getChallengeStatusServer(
  userId: string,
  supabaseOverride?: SupabaseClient
): Promise<ChallengeStatus> {
  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .from("profiles")
    .select("streak_days, last_streak_login_at, last_daily_post_bonus_at")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Error fetching challenge status:", error);
    return { streakDays: 0, lastStreakLoginAt: null, lastDailyPostBonusAt: null };
  }

  let streakDays = data?.streak_days || 0;
  const lastStreakLoginAt = data?.last_streak_login_at || null;

  // 継続条件外（2日以上空いた）の場合は Day 1 相当にリセット
  if (
    isStreakBroken(lastStreakLoginAt) &&
    streakDays > 0
  ) {
    await supabase
      .from("profiles")
      .update({ streak_days: 0, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    streakDays = 0;
  }

  return {
    streakDays,
    lastStreakLoginAt,
    lastDailyPostBonusAt: data?.last_daily_post_bonus_at || null,
  };
}
