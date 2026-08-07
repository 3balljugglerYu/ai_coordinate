import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSubscriptionBonusMultiplier,
  normalizeSubscriptionPlan,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";

export type PercoinDefaultsForDisplay = {
  referralBonusAmount: number;
  dailyPostBonusAmount: number;
  streakBonusSchedule: readonly number[];
  /**
   * クリエイター還元(自分の作品が他ユーザーに使われたときの付与額)。
   * 0 は「停止中」を意味し、告知そのものを出さない判断に使う。
   * サブスク倍率は掛けない(還元は利用者側の行動で発生し、受け手のプラン特典ではない)。
   */
  promptUsageRewardAmount: number;
  styleUsageRewardAmount: number;
};

export function applySubscriptionBonusMultiplierForDisplay(
  defaults: PercoinDefaultsForDisplay,
  subscriptionPlan: SubscriptionPlan
): PercoinDefaultsForDisplay {
  const multiplier = getSubscriptionBonusMultiplier(subscriptionPlan);

  if (multiplier === 1) {
    return defaults;
  }

  return {
    referralBonusAmount: defaults.referralBonusAmount,
    dailyPostBonusAmount: Math.ceil(defaults.dailyPostBonusAmount * multiplier),
    streakBonusSchedule: defaults.streakBonusSchedule.map((amount) =>
      Math.ceil(amount * multiplier)
    ),
    // 還元は倍率の対象外(受け手のプランで額が変わる性質のものではない)
    promptUsageRewardAmount: defaults.promptUsageRewardAmount,
    styleUsageRewardAmount: defaults.styleUsageRewardAmount,
  };
}

/**
 * 表示用デフォルト枚数を取得（チャレンジ画面・紹介画面等）
 * React.cache でラップして同一リクエスト内の重複取得を防止
 * createAdminClient 使用（RLS で anon/authenticated は拒否のため）
 */
export const getPercoinDefaultsForDisplay = cache(
  async (
    subscriptionPlan: SubscriptionPlan = "free"
  ): Promise<PercoinDefaultsForDisplay> => {
    const supabase = createAdminClient();

    const [bonusResult, streakResult] = await Promise.all([
      supabase
        .from("percoin_bonus_defaults")
        .select("source, amount")
        .in("source", [
          "referral",
          "daily_post",
          "prompt_usage_reward",
          "style_usage_reward",
        ]),
      supabase
        .from("percoin_streak_defaults")
        .select("streak_day, amount")
        .order("streak_day", { ascending: true }),
    ]);

    const referralAmount =
      bonusResult.data?.find((r) => r.source === "referral")?.amount ?? 100;
    const dailyPostAmount =
      bonusResult.data?.find((r) => r.source === "daily_post")?.amount ?? 15;

    const streakSchedule =
      streakResult.data && streakResult.data.length === 14
        ? (streakResult.data.map((r) => r.amount) as readonly number[])
        : ([10, 10, 20, 10, 10, 10, 50, 10, 10, 10, 10, 10, 10, 100] as const);

    // 還元は既定 0 = 停止中。行が無い環境でも 0 として扱い、告知を出さない。
    const promptUsageRewardAmount =
      bonusResult.data?.find((r) => r.source === "prompt_usage_reward")?.amount ??
      0;
    const styleUsageRewardAmount =
      bonusResult.data?.find((r) => r.source === "style_usage_reward")?.amount ??
      0;

    const defaults = {
      referralBonusAmount: referralAmount,
      dailyPostBonusAmount: dailyPostAmount,
      streakBonusSchedule: streakSchedule,
      promptUsageRewardAmount,
      styleUsageRewardAmount,
    };

    return applySubscriptionBonusMultiplierForDisplay(
      defaults,
      normalizeSubscriptionPlan(subscriptionPlan)
    );
  }
);
