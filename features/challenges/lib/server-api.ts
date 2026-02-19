import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface ChallengeStatus {
  streakDays: number;
  lastStreakLoginAt: string | null;
  lastDailyPostBonusAt: string | null;
}

/**
 * ミッション関連のステータスを取得（サーバーサイド）
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

  return {
    streakDays: data?.streak_days || 0,
    lastStreakLoginAt: data?.last_streak_login_at || null,
    lastDailyPostBonusAt: data?.last_daily_post_bonus_at || null,
  };
}
