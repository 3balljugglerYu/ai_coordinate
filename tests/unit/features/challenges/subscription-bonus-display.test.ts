import {
  buildMissionBonusDisplay,
  formatSubscriptionBonusMultiplier,
  getRewardForDay,
} from "@/features/challenges/lib/subscription-bonus-display";

describe("subscription-bonus-display", () => {
  test("formats subscription bonus multiplier with one decimal place", () => {
    expect(formatSubscriptionBonusMultiplier(1.2)).toBe("1.2");
    expect(formatSubscriptionBonusMultiplier(2)).toBe("2.0");
  });

  test("builds boosted daily and streak comparison data", () => {
    expect(
      buildMissionBonusDisplay({
        subscriptionPlan: "standard",
        baseDailyPostBonusAmount: 31,
        dailyPostBonusAmount: 47,
        baseStreakBonusSchedule: [11, 20, 60],
        streakBonusSchedule: [17, 30, 90],
      })
    ).toEqual({
      subscriptionPlan: "standard",
      multiplier: 1.5,
      multiplierLabel: "1.5",
      hasBoostedRewards: true,
      daily: {
        base: 31,
        boosted: 47,
        extra: 16,
      },
      streak: {
        baseMax: 60,
        boostedMax: 90,
        extraMax: 30,
        baseTotal: 91,
        boostedTotal: 137,
        extraTotal: 46,
      },
    });
  });

  test("returns unboosted state for free plan", () => {
    expect(
      buildMissionBonusDisplay({
        subscriptionPlan: "free",
        baseDailyPostBonusAmount: 30,
        dailyPostBonusAmount: 30,
        baseStreakBonusSchedule: [10, 10, 20],
        streakBonusSchedule: [10, 10, 20],
      }).hasBoostedRewards
    ).toBe(false);
  });

  test("gets reward amount for a given streak day", () => {
    expect(getRewardForDay([10, 20, 30], 2)).toBe(20);
    expect(getRewardForDay([10, 20, 30], 4)).toBeNull();
  });
});
