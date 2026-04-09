import {
  getSubscriptionBonusMultiplier,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";

type MissionBonusDisplayInput = {
  subscriptionPlan: SubscriptionPlan;
  baseDailyPostBonusAmount: number;
  dailyPostBonusAmount: number;
  baseStreakBonusSchedule: readonly number[];
  streakBonusSchedule: readonly number[];
};

export type MissionBonusDisplay = {
  subscriptionPlan: SubscriptionPlan;
  multiplier: number;
  multiplierLabel: string;
  hasBoostedRewards: boolean;
  daily: {
    base: number;
    boosted: number;
    extra: number;
  };
  streak: {
    baseMax: number;
    boostedMax: number;
    extraMax: number;
    baseTotal: number;
    boostedTotal: number;
    extraTotal: number;
  };
};

export function formatSubscriptionBonusMultiplier(multiplier: number): string {
  return multiplier.toFixed(1);
}

export function getRewardForDay(
  schedule: readonly number[],
  day: number
): number | null {
  if (day < 1 || day > schedule.length) {
    return null;
  }

  return schedule[day - 1] ?? null;
}

export function buildMissionBonusDisplay(
  input: MissionBonusDisplayInput
): MissionBonusDisplay {
  const multiplier = getSubscriptionBonusMultiplier(input.subscriptionPlan);
  const baseStreakMax = Math.max(...input.baseStreakBonusSchedule);
  const boostedStreakMax = Math.max(...input.streakBonusSchedule);
  const baseStreakTotal = input.baseStreakBonusSchedule.reduce(
    (sum, amount) => sum + amount,
    0
  );
  const boostedStreakTotal = input.streakBonusSchedule.reduce(
    (sum, amount) => sum + amount,
    0
  );

  return {
    subscriptionPlan: input.subscriptionPlan,
    multiplier,
    multiplierLabel: formatSubscriptionBonusMultiplier(multiplier),
    hasBoostedRewards:
      input.subscriptionPlan !== "free" && multiplier > 1,
    daily: {
      base: input.baseDailyPostBonusAmount,
      boosted: input.dailyPostBonusAmount,
      extra: Math.max(
        input.dailyPostBonusAmount - input.baseDailyPostBonusAmount,
        0
      ),
    },
    streak: {
      baseMax: baseStreakMax,
      boostedMax: boostedStreakMax,
      extraMax: Math.max(boostedStreakMax - baseStreakMax, 0),
      baseTotal: baseStreakTotal,
      boostedTotal: boostedStreakTotal,
      extraTotal: Math.max(boostedStreakTotal - baseStreakTotal, 0),
    },
  };
}
