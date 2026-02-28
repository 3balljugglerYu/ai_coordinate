import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type PercoinDefaultsForDisplay = {
  referralBonusAmount: number;
  dailyPostBonusAmount: number;
  streakBonusSchedule: readonly number[];
};

/**
 * 表示用デフォルト枚数を取得（チャレンジ画面・紹介画面等）
 * React.cache でラップして同一リクエスト内の重複取得を防止
 * createAdminClient 使用（RLS で anon/authenticated は拒否のため）
 */
export const getPercoinDefaultsForDisplay = cache(
  async (): Promise<PercoinDefaultsForDisplay> => {
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
      bonusResult.data?.find((r) => r.source === "daily_post")?.amount ?? 30;

    const streakSchedule =
      streakResult.data && streakResult.data.length === 14
        ? (streakResult.data.map((r) => r.amount) as readonly number[])
        : ([10, 10, 20, 10, 10, 10, 50, 10, 10, 10, 10, 10, 10, 100] as const);

    return {
      referralBonusAmount: referralAmount,
      dailyPostBonusAmount: dailyPostAmount,
      streakBonusSchedule: streakSchedule,
    };
  }
);
