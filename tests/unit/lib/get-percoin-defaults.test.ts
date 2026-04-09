import {
  applySubscriptionBonusMultiplierForDisplay,
  type PercoinDefaultsForDisplay,
} from "@/features/credits/lib/get-percoin-defaults";

describe("applySubscriptionBonusMultiplierForDisplay", () => {
  const defaults: PercoinDefaultsForDisplay = {
    referralBonusAmount: 100,
    dailyPostBonusAmount: 30,
    streakBonusSchedule: [10, 10, 20, 50],
  };

  test("free plan keeps base amounts", () => {
    expect(applySubscriptionBonusMultiplierForDisplay(defaults, "free")).toEqual(
      defaults
    );
  });

  test("paid plans apply ceil multiplier only to daily and streak rewards", () => {
    expect(
      applySubscriptionBonusMultiplierForDisplay(defaults, "light")
    ).toEqual({
      referralBonusAmount: 100,
      dailyPostBonusAmount: 36,
      streakBonusSchedule: [12, 12, 24, 60],
    });

    expect(
      applySubscriptionBonusMultiplierForDisplay(
        {
          referralBonusAmount: 100,
          dailyPostBonusAmount: 31,
          streakBonusSchedule: [11],
        },
        "standard"
      )
    ).toEqual({
      referralBonusAmount: 100,
      dailyPostBonusAmount: 47,
      streakBonusSchedule: [17],
    });
  });
});
