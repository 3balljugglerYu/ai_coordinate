import { createClient } from "@/lib/supabase/client";

export interface ChallengeStatus {
  streakDays: number;
  lastStreakLoginAt: string | null;
  lastDailyPostBonusAt: string | null;
}

export interface CheckInStreakBonusResponse {
  bonus_granted: number;
  streak_days: number | null;
  checked_in_today: boolean;
  last_streak_login_at: string | null;
}

/**
 * チャレンジ関連のステータス（連続ログイン日数、最終デイリーボーナス日時）を取得
 */
export async function getChallengeStatus(): Promise<ChallengeStatus> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { streakDays: 0, lastStreakLoginAt: null, lastDailyPostBonusAt: null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("streak_days, last_streak_login_at, last_daily_post_bonus_at")
    .eq("user_id", user.id)
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

/**
 * ユーザーの連続ログイン日数を取得（後方互換性のため残す、内部でgetChallengeStatusを利用）
 */
export async function getStreakDays(): Promise<number> {
  const status = await getChallengeStatus();
  return status.streakDays;
}

/**
 * 連続ログインボーナスをチェックインで取得
 */
export async function checkInStreakBonus(): Promise<CheckInStreakBonusResponse> {
  const response = await fetch("/api/streak/check", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || "チェックインに失敗しました");
  }

  return response.json() as Promise<CheckInStreakBonusResponse>;
}
