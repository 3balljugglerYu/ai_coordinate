import { createClient } from "@/lib/supabase/client";

export interface ChallengeStatus {
  streakDays: number;
  lastDailyPostBonusAt: string | null;
}

/**
 * チャレンジ関連のステータス（連続ログイン日数、最終デイリーボーナス日時）を取得
 */
export async function getChallengeStatus(): Promise<ChallengeStatus> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { streakDays: 0, lastDailyPostBonusAt: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("streak_days, last_daily_post_bonus_at")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching challenge status:", error);
    return { streakDays: 0, lastDailyPostBonusAt: null };
  }

  return {
    streakDays: data?.streak_days || 0,
    lastDailyPostBonusAt: data?.last_daily_post_bonus_at || null,
  };
}

/**
 * ユーザーの連続ログイン日数を取得（後方互換性のため残す、内部でgetChallengeStatusを利用）
 */
export async function getStreakDays(): Promise<number> {
  const status = await getChallengeStatus();
  return status.streakDays;
}
