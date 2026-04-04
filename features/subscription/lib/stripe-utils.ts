import Stripe from "stripe";
import { env } from "@/lib/env";
import {
  SUBSCRIPTION_PLAN_CONFIG,
  getSubscriptionPriceConfig,
  getSubscriptionPriceIdOverride,
  type PaidSubscriptionPlan,
  type SubscriptionBillingInterval,
} from "@/features/subscription/subscription-config";

export function createStripeClient() {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-12-15.clover",
  });
}

export async function resolveSubscriptionPriceId(
  stripe: Stripe,
  plan: PaidSubscriptionPlan,
  billingInterval: SubscriptionBillingInterval
) {
  const explicitPriceId = getSubscriptionPriceIdOverride(plan, billingInterval);
  if (explicitPriceId) {
    return explicitPriceId;
  }

  const priceConfig = getSubscriptionPriceConfig(plan, billingInterval);
  const lookupResult = await stripe.prices.list({
    lookup_keys: [priceConfig.lookupKey],
    active: true,
    limit: 1,
  });

  return lookupResult.data[0]?.id ?? null;
}

export function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

export function getSubscriptionId(
  subscription: string | Stripe.Subscription | null | undefined
) {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

export function toIsoTimestamp(value?: number | null): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

export function getSubscriptionItem(
  subscription: Stripe.Subscription
): Stripe.SubscriptionItem | null {
  return subscription.items.data[0] ?? null;
}

export function getBillingIntervalFromStripeSubscription(
  subscription: Stripe.Subscription
): SubscriptionBillingInterval | null {
  const interval = getSubscriptionItem(subscription)?.price.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : null;
}

export function getSubscriptionPlanFromStripeSubscription(
  subscription: Stripe.Subscription
): PaidSubscriptionPlan | null {
  const price = getSubscriptionItem(subscription)?.price;
  if (!price || typeof price === "string") {
    return null;
  }

  const lookupKey =
    typeof price.lookup_key === "string" ? price.lookup_key : null;

  for (const plan of ["light", "standard", "premium"] as const) {
    for (const billingInterval of ["month", "year"] as const) {
      const config = SUBSCRIPTION_PLAN_CONFIG[plan].prices[billingInterval];

      if (lookupKey && config.lookupKey === lookupKey) {
        return plan;
      }

      const overridePriceId = getSubscriptionPriceIdOverride(
        plan,
        billingInterval
      );
      if (overridePriceId && overridePriceId === price.id) {
        return plan;
      }
    }
  }

  return null;
}
