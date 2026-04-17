import {
  applySubscriptionBonusMultiplierForDisplay,
  type PercoinDefaultsForDisplay,
} from "@/features/credits/lib/get-percoin-defaults";

describe("applySubscriptionBonusMultiplierForDisplay", () => {
  const defaults: PercoinDefaultsForDisplay = {
    referralBonusAmount: 100,
    dailyPostBonusAmount: 15,
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
      dailyPostBonusAmount: 17,
      streakBonusSchedule: [11, 11, 22, 56],
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
      dailyPostBonusAmount: 41,
      streakBonusSchedule: [15],
    });
  });
});
