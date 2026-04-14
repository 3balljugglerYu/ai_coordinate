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
        .in("source", ["referral", "daily_post"]),
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

    const defaults = {
      referralBonusAmount: referralAmount,
      dailyPostBonusAmount: dailyPostAmount,
      streakBonusSchedule: streakSchedule,
    };

    return applySubscriptionBonusMultiplierForDisplay(
      defaults,
      normalizeSubscriptionPlan(subscriptionPlan)
    );
  }
);
