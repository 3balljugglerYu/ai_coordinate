import {
  getImmediateSubscriptionGrantAmount,
  getSubscriptionChangeKind,
  isImmediateSubscriptionChange,
  requiresIntervalChangeConfirmation,
} from "@/features/subscription/lib/change-policy";
import {
  getSubscriptionCyclePercoins,
  getSubscriptionMonthlyPercoins,
} from "@/features/subscription/subscription-config";

describe("Subscription change policy", () => {
  test("同一 interval の上方向は即時変更として扱う", () => {
    const changeKind = getSubscriptionChangeKind({
      currentPlan: "light",
      currentBillingInterval: "month",
      targetPlan: "premium",
      targetBillingInterval: "month",
    });

    expect(changeKind).toBe("same_interval_upgrade");
    expect(isImmediateSubscriptionChange(changeKind)).toBe(true);
    expect(requiresIntervalChangeConfirmation(changeKind)).toBe(false);
  });

  test("同一 interval の下方向は次回更新で反映する", () => {
    const changeKind = getSubscriptionChangeKind({
      currentPlan: "premium",
      currentBillingInterval: "month",
      targetPlan: "standard",
      targetBillingInterval: "month",
    });

    expect(changeKind).toBe("same_interval_downgrade");
    expect(isImmediateSubscriptionChange(changeKind)).toBe(false);
    expect(requiresIntervalChangeConfirmation(changeKind)).toBe(false);
  });

  test("monthly から yearly は予約変更かつ確認必須", () => {
    const changeKind = getSubscriptionChangeKind({
      currentPlan: "standard",
      currentBillingInterval: "month",
      targetPlan: "premium",
      targetBillingInterval: "year",
    });

    expect(changeKind).toBe("monthly_to_yearly");
    expect(isImmediateSubscriptionChange(changeKind)).toBe(false);
    expect(requiresIntervalChangeConfirmation(changeKind)).toBe(true);
  });

  test("yearly から monthly は予約変更かつ確認必須", () => {
    const changeKind = getSubscriptionChangeKind({
      currentPlan: "premium",
      currentBillingInterval: "year",
      targetPlan: "light",
      targetBillingInterval: "month",
    });

    expect(changeKind).toBe("yearly_to_monthly");
    expect(isImmediateSubscriptionChange(changeKind)).toBe(false);
    expect(requiresIntervalChangeConfirmation(changeKind)).toBe(true);
  });

  test("同じプランと interval は no_change になる", () => {
    const changeKind = getSubscriptionChangeKind({
      currentPlan: "standard",
      currentBillingInterval: "month",
      targetPlan: "standard",
      targetBillingInterval: "month",
    });

    expect(changeKind).toBe("no_change");
    expect(isImmediateSubscriptionChange(changeKind)).toBe(false);
    expect(requiresIntervalChangeConfirmation(changeKind)).toBe(false);
  });

  test("年額サイクルの付与量は月額の 12 倍になる", () => {
    expect(getSubscriptionCyclePercoins("light", "month")).toBe(400);
    expect(getSubscriptionCyclePercoins("light", "year")).toBe(4800);
    expect(getSubscriptionCyclePercoins("standard", "year")).toBe(14400);
    expect(getSubscriptionMonthlyPercoins("premium")).toBe(3000);
  });

  test("同一 interval のアップグレードでは差分ペルコインだけ付与する", () => {
    expect(
      getImmediateSubscriptionGrantAmount({
        changeKind: "same_interval_upgrade",
        currentPlan: "light",
        currentBillingInterval: "month",
        targetPlan: "standard",
        targetBillingInterval: "month",
      })
    ).toBe(800);

    expect(
      getImmediateSubscriptionGrantAmount({
        changeKind: "same_interval_upgrade",
        currentPlan: "standard",
        currentBillingInterval: "month",
        targetPlan: "premium",
        targetBillingInterval: "month",
      })
    ).toBe(1800);
  });

  test("interval 変更の予約では追加付与しない", () => {
    expect(
      getImmediateSubscriptionGrantAmount({
        changeKind: "monthly_to_yearly",
        currentPlan: "light",
        currentBillingInterval: "month",
        targetPlan: "light",
        targetBillingInterval: "year",
      })
    ).toBe(0);

    expect(
      getImmediateSubscriptionGrantAmount({
        changeKind: "monthly_to_yearly",
        currentPlan: "standard",
        currentBillingInterval: "month",
        targetPlan: "premium",
        targetBillingInterval: "year",
      })
    ).toBe(0);

    expect(
      getImmediateSubscriptionGrantAmount({
        changeKind: "yearly_to_monthly",
        currentPlan: "premium",
        currentBillingInterval: "year",
        targetPlan: "light",
        targetBillingInterval: "month",
      })
    ).toBe(0);
  });

  test("予約変更では追加付与しない", () => {
    expect(
      getImmediateSubscriptionGrantAmount({
        changeKind: "same_interval_downgrade",
        currentPlan: "premium",
        currentBillingInterval: "month",
        targetPlan: "standard",
        targetBillingInterval: "month",
      })
    ).toBe(0);
  });
});
