import {
  buildMissionBonusDisplay,
  formatSubscriptionBonusMultiplier,
  getRewardForDay,
} from "@/features/challenges/lib/subscription-bonus-display";

describe("subscription-bonus-display", () => {
  test("formats subscription bonus multiplier with one decimal place", () => {
    expect(formatSubscriptionBonusMultiplier(1.1)).toBe("1.1");
    expect(formatSubscriptionBonusMultiplier(1.5)).toBe("1.5");
  });

  test("builds boosted daily and streak comparison data", () => {
    expect(
      buildMissionBonusDisplay({
        subscriptionPlan: "standard",
        baseDailyPostBonusAmount: 15,
        dailyPostBonusAmount: 20,
        baseStreakBonusSchedule: [10, 20, 100],
        streakBonusSchedule: [13, 26, 130],
      })
    ).toEqual({
      subscriptionPlan: "standard",
      multiplier: 1.3,
      multiplierLabel: "1.3",
      hasBoostedRewards: true,
      daily: {
        base: 15,
        boosted: 20,
        extra: 5,
      },
      streak: {
        baseMax: 100,
        boostedMax: 130,
        extraMax: 30,
        baseTotal: 130,
        boostedTotal: 169,
        extraTotal: 39,
      },
    });
  });

  test("returns unboosted state for free plan", () => {
    expect(
      buildMissionBonusDisplay({
        subscriptionPlan: "free",
        baseDailyPostBonusAmount: 15,
        dailyPostBonusAmount: 15,
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
