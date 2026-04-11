import { isStripeTestMode } from "@/lib/env";

export type SubscriptionPlan = "free" | "light" | "standard" | "premium";
export type SubscriptionBillingInterval = "month" | "year";
export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, "free">;
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused"
  | "inactive";

type SubscriptionPriceConfig = {
  amountYen: number;
  lookupKey: string;
  /**
   * Optional environment variable override.
   * Useful when the Stripe price already exists but lookup keys are not configured yet.
   */
  envVar?: string;
};

type SubscriptionPlanConfig = {
  monthlyPercoins: number;
  maxGenerationCount: number;
  stockImageLimit: number;
  bonusMultiplier: number;
  prices: Record<SubscriptionBillingInterval, SubscriptionPriceConfig>;
};

export const SUBSCRIPTION_PLAN_ORDER: SubscriptionPlan[] = [
  "free",
  "light",
  "standard",
  "premium",
];

export const SUBSCRIPTION_ACTIVE_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
];

export const SUBSCRIPTION_CHECKOUT_BLOCKED_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
];

export const SUBSCRIPTION_PLAN_CONFIG: Record<
  SubscriptionPlan,
  SubscriptionPlanConfig
> = {
  free: {
    monthlyPercoins: 0,
    maxGenerationCount: 1,
    stockImageLimit: 2,
    bonusMultiplier: 1,
    prices: {
      month: {
        amountYen: 0,
        lookupKey: "persta_subscription_free_monthly",
      },
      year: {
        amountYen: 0,
        lookupKey: "persta_subscription_free_yearly",
      },
    },
  },
  light: {
    monthlyPercoins: 300,
    maxGenerationCount: 2,
    stockImageLimit: 5,
    bonusMultiplier: 1.1,
    prices: {
      month: {
        amountYen: 980,
        lookupKey: "persta_subscription_light_monthly",
        envVar: "STRIPE_SUBSCRIPTION_LIGHT_MONTHLY_PRICE_ID",
      },
      year: {
        amountYen: 10600,
        lookupKey: "persta_subscription_light_yearly",
        envVar: "STRIPE_SUBSCRIPTION_LIGHT_YEARLY_PRICE_ID",
      },
    },
  },
  standard: {
    monthlyPercoins: 1000,
    maxGenerationCount: 4,
    stockImageLimit: 10,
    bonusMultiplier: 1.3,
    prices: {
      month: {
        amountYen: 2480,
        lookupKey: "persta_subscription_standard_monthly",
        envVar: "STRIPE_SUBSCRIPTION_STANDARD_MONTHLY_PRICE_ID",
      },
      year: {
        amountYen: 26800,
        lookupKey: "persta_subscription_standard_yearly",
        envVar: "STRIPE_SUBSCRIPTION_STANDARD_YEARLY_PRICE_ID",
      },
    },
  },
  premium: {
    monthlyPercoins: 2500,
    maxGenerationCount: 4,
    stockImageLimit: 30,
    bonusMultiplier: 1.5,
    prices: {
      month: {
        amountYen: 4980,
        lookupKey: "persta_subscription_premium_monthly",
        envVar: "STRIPE_SUBSCRIPTION_PREMIUM_MONTHLY_PRICE_ID",
      },
      year: {
        amountYen: 53800,
        lookupKey: "persta_subscription_premium_yearly",
        envVar: "STRIPE_SUBSCRIPTION_PREMIUM_YEARLY_PRICE_ID",
      },
    },
  },
};

export function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return value in SUBSCRIPTION_PLAN_CONFIG;
}

export function isSubscriptionStatus(
  value: string
): value is SubscriptionStatus {
  return (
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled" ||
    value === "incomplete" ||
    value === "incomplete_expired" ||
    value === "unpaid" ||
    value === "paused" ||
    value === "inactive"
  );
}

export function getMaxGenerationCount(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_CONFIG[plan].maxGenerationCount;
}

export function getSubscriptionMonthlyPercoins(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_CONFIG[plan].monthlyPercoins;
}

export function getSubscriptionCyclePercoins(
  plan: SubscriptionPlan,
  billingInterval: SubscriptionBillingInterval
): number {
  const monthlyAmount = getSubscriptionMonthlyPercoins(plan);
  return billingInterval === "year" ? monthlyAmount * 12 : monthlyAmount;
}

export function getSubscriptionBonusMultiplier(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_CONFIG[plan].bonusMultiplier;
}

export function getSubscriptionStockImageLimit(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_CONFIG[plan].stockImageLimit;
}

export function isActiveSubscriptionStatus(status: SubscriptionStatus): boolean {
  return SUBSCRIPTION_ACTIVE_STATUSES.includes(status);
}

export function blocksNewSubscriptionCheckout(
  status: SubscriptionStatus
): boolean {
  return SUBSCRIPTION_CHECKOUT_BLOCKED_STATUSES.includes(status);
}

export function normalizeSubscriptionPlan(value?: string | null): SubscriptionPlan {
  return value && isSubscriptionPlan(value) ? value : "free";
}

export function normalizeSubscriptionStatus(
  value?: string | null
): SubscriptionStatus {
  return value && isSubscriptionStatus(value) ? value : "inactive";
}

export function getSubscriptionPriceConfig(
  plan: PaidSubscriptionPlan,
  billingInterval: SubscriptionBillingInterval
): SubscriptionPriceConfig {
  return SUBSCRIPTION_PLAN_CONFIG[plan].prices[billingInterval];
}

export function getSubscriptionPriceIdOverride(
  plan: PaidSubscriptionPlan,
  billingInterval: SubscriptionBillingInterval
): string | null {
  const config = getSubscriptionPriceConfig(plan, billingInterval);
  const directOverride = config.envVar ? process.env[config.envVar] : null;

  if (directOverride) {
    return directOverride;
  }

  const modeScopedKey = isStripeTestMode()
    ? `NEXT_PUBLIC_TEST_${plan.toUpperCase()}_${billingInterval.toUpperCase()}_SUBSCRIPTION_PRICE_ID`
    : `NEXT_PUBLIC_LIVE_${plan.toUpperCase()}_${billingInterval.toUpperCase()}_SUBSCRIPTION_PRICE_ID`;

  return process.env[modeScopedKey] ?? null;
}

export function getSubscriptionPlanRank(plan: SubscriptionPlan): number {
  return SUBSCRIPTION_PLAN_ORDER.indexOf(plan);
}

export function isPaidSubscriptionPlan(
  value: string
): value is PaidSubscriptionPlan {
  return value === "light" || value === "standard" || value === "premium";
}
