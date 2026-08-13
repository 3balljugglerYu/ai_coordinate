import { createClient } from "@/lib/supabase/client";
import { getJstDateString, isStreakBroken } from "./streak-utils";

export interface ChallengeStatus {
  streakDays: number;
  lastStreakLoginAt: string | null;
  /**
   * @deprecated 履歴互換のみ。投稿ミッションの達成判定には使わないこと。
   * 生成方法ごとに1日1回になったため、この単一列では
   * 「ワンタップだけ達成」と「両方達成」を区別できない。
   */
  lastDailyPostBonusAt: string | null;
  /** 今日すでに投稿ボーナスを受け取った生成方法（JST）。 */
  postBonusReceivedTypes: string[];
  subscriptionPlan: "free" | "light" | "standard" | "premium";
}

export interface CheckInStreakBonusResponse {
  bonus_granted: number;
  streak_days: number | null;
  checked_in_today: boolean;
  last_streak_login_at: string | null;
}

interface ChallengeApiMessages {
  checkInFailed?: string;
}

/**
 * ミッション関連のステータス（連続ログイン日数、最終デイリーボーナス日時）を取得
 * 連続チェックインが途切れている場合は表示用に streakDays: 0 を返す（getChallengeStatusServer と同様）
 */
export async function getChallengeStatus(): Promise<ChallengeStatus> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      streakDays: 0,
      lastStreakLoginAt: null,
      lastDailyPostBonusAt: null,
      postBonusReceivedTypes: [],
      subscriptionPlan: "free",
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("streak_days, last_streak_login_at, last_daily_post_bonus_at, subscription_plan")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching challenge status:", error);
    return {
      streakDays: 0,
      lastStreakLoginAt: null,
      lastDailyPostBonusAt: null,
      postBonusReceivedTypes: [],
      subscriptionPlan: "free",
    };
  }

  // 生成方法ごとの受取状況。本人SELECTポリシーがあるのでブラウザから読める
  const { data: grants } = await supabase
    .from("daily_post_bonus_grants")
    .select("generation_type")
    .eq("user_id", user.id)
    .eq("jst_date", getJstDateString(new Date()));

  let streakDays = data?.streak_days || 0;
  const lastStreakLoginAt = data?.last_streak_login_at || null;

  // 継続条件外（2日以上空いた）の場合は表示用に 0 を返す（DB は更新しない）
  if (isStreakBroken(lastStreakLoginAt) && streakDays > 0) {
    streakDays = 0;
  }

  return {
    streakDays,
    lastStreakLoginAt,
    lastDailyPostBonusAt: data?.last_daily_post_bonus_at || null,
    postBonusReceivedTypes: (grants ?? []).map((g) => g.generation_type),
    subscriptionPlan:
      data?.subscription_plan === "light" ||
      data?.subscription_plan === "standard" ||
      data?.subscription_plan === "premium"
        ? data.subscription_plan
        : "free",
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
export async function checkInStreakBonus(
  messages?: ChallengeApiMessages
): Promise<CheckInStreakBonusResponse> {
  const response = await fetch("/api/streak/check", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || messages?.checkInFailed || "チェックインに失敗しました");
  }

  return response.json() as Promise<CheckInStreakBonusResponse>;
}
