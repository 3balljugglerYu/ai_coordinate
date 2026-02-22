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
 * 連続チェックインが途切れている場合は表示用に streakDays: 0 を返す（DB は更新しない）
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

  // 継続条件外（2日以上空いた）の場合は表示用に 0 を返す（DB は更新しない・副作用なし）
  // 実際のリセットはチェックイン時（POST）の grant_streak_bonus で行う
  if (isStreakBroken(lastStreakLoginAt) && streakDays > 0) {
    streakDays = 0;
  }

  return {
    streakDays,
    lastStreakLoginAt,
    lastDailyPostBonusAt: data?.last_daily_post_bonus_at || null,
  };
}
