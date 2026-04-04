import type Stripe from "stripe";
import { getSubscriptionPlanFromStripeSubscription } from "@/features/subscription/lib/stripe-utils";

function createSubscription(params: {
  priceId: string;
  lookupKey?: string | null;
}): Stripe.Subscription {
  return {
    items: {
      data: [
        {
          price: {
            id: params.priceId,
            lookup_key: params.lookupKey ?? null,
            recurring: {
              interval: "month",
            },
          },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe("getSubscriptionPlanFromStripeSubscription", () => {
  it("returns the paid plan inferred from Stripe price lookup key", () => {
    const subscription = createSubscription({
      priceId: "price_any_standard_monthly",
      lookupKey: "persta_subscription_standard_monthly",
    });

    expect(getSubscriptionPlanFromStripeSubscription(subscription)).toBe(
      "standard"
    );
  });

  it("returns null when the price cannot be matched to a plan", () => {
    const subscription = createSubscription({
      priceId: "price_unknown",
      lookupKey: "unknown_lookup_key",
    });

    expect(getSubscriptionPlanFromStripeSubscription(subscription)).toBeNull();
  });
});
