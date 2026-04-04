import {
  getSubscriptionMonthlyPercoins,
  getSubscriptionPlanRank,
  type PaidSubscriptionPlan,
  type SubscriptionBillingInterval,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";

export type SubscriptionChangeKind =
  | "same_interval_upgrade"
  | "same_interval_downgrade"
  | "monthly_to_yearly"
  | "yearly_to_monthly"
  | "no_change";

export interface SubscriptionChangePreview {
  changeKind: SubscriptionChangeKind;
  currentPlan: PaidSubscriptionPlan;
  currentBillingInterval: SubscriptionBillingInterval;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
  effectiveAt: string;
  currentPeriodEnd: string | null;
  confirmationRequired: boolean;
  isImmediate: boolean;
  priceAmountYen: number | null;
  creditAmountYen: number | null;
  amountDueYen: number | null;
  currency: string;
  grantAmount: number;
}

export function getSubscriptionChangeKind(params: {
  currentPlan: SubscriptionPlan;
  currentBillingInterval: SubscriptionBillingInterval;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
}): SubscriptionChangeKind {
  const {
    currentPlan,
    currentBillingInterval,
    targetPlan,
    targetBillingInterval,
  } = params;

  if (
    currentPlan === targetPlan &&
    currentBillingInterval === targetBillingInterval
  ) {
    return "no_change";
  }

  if (currentBillingInterval !== targetBillingInterval) {
    return currentBillingInterval === "month"
      ? "monthly_to_yearly"
      : "yearly_to_monthly";
  }

  return getSubscriptionPlanRank(targetPlan) > getSubscriptionPlanRank(currentPlan)
    ? "same_interval_upgrade"
    : "same_interval_downgrade";
}

export function isImmediateSubscriptionChange(
  changeKind: SubscriptionChangeKind
): boolean {
  return changeKind === "same_interval_upgrade";
}

export function requiresSubscriptionChangeConfirmation(
  changeKind: SubscriptionChangeKind
): boolean {
  return changeKind !== "no_change";
}

export function requiresIntervalChangeConfirmation(
  changeKind: SubscriptionChangeKind
): boolean {
  return (
    changeKind === "monthly_to_yearly" || changeKind === "yearly_to_monthly"
  );
}

export function getImmediateSubscriptionGrantAmount(params: {
  changeKind: SubscriptionChangeKind;
  currentPlan: SubscriptionPlan;
  currentBillingInterval: SubscriptionBillingInterval;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
}): number {
  if (!isImmediateSubscriptionChange(params.changeKind)) {
    return 0;
  }

  const currentCycleAmount = getSubscriptionMonthlyPercoins(params.currentPlan);
  const targetCycleAmount = getSubscriptionMonthlyPercoins(params.targetPlan);

  return Math.max(targetCycleAmount - currentCycleAmount, 0);
}
