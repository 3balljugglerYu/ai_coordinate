import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { ROUTES } from "@/constants";
import { getUser } from "@/lib/auth";
import { env, getSiteUrl } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSubscriptionRouteCopy } from "@/features/subscription/lib/route-copy";
import {
  blocksNewSubscriptionCheckout,
  getSubscriptionPriceConfig,
  getSubscriptionMonthlyPercoins,
  type PaidSubscriptionPlan,
  type SubscriptionBillingInterval,
} from "@/features/subscription/subscription-config";
import { fetchUserSubscription } from "@/features/subscription/lib/server-api";
import { getOrCreateStripeCustomer } from "@/features/subscription/lib/stripe-customer";
import {
  createStripeClient,
  resolveSubscriptionPriceId,
} from "@/features/subscription/lib/stripe-utils";
import { recordMonetizationEvent } from "@/features/monetization/lib/record-monetization-event";
import { runAfterResponse } from "@/features/monetization/lib/after-response";
import { purchaseOriginSchema } from "@/features/monetization/lib/purchase-origin";

const checkoutBodySchema = z.object({
  planId: z.enum(["light", "standard", "premium"]),
  billingInterval: z.enum(["month", "year"]),
  // 課金の表示元(計測用・任意)。購入と同じ決まり
  origin: purchaseOriginSchema.optional(),
});

export async function POST(request: NextRequest) {
  const copy = getSubscriptionRouteCopy(getRouteLocale(request));

  try {
    const body = await request.json().catch(() => null);
    const parsed = checkoutBodySchema.safeParse(body);

    if (!parsed.success) {
      const invalidInterval = parsed.error.issues.some(
        (issue) => issue.path[0] === "billingInterval"
      );
      return jsonError(
        invalidInterval ? copy.invalidBillingInterval : copy.invalidPlan,
        invalidInterval
          ? "SUBSCRIPTION_INVALID_BILLING_INTERVAL"
          : "SUBSCRIPTION_INVALID_PLAN",
        400
      );
    }

    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return jsonError(
        copy.checkoutUnavailable,
        "SUBSCRIPTION_CHECKOUT_UNAVAILABLE",
        503
      );
    }

    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SUBSCRIPTION_AUTH_REQUIRED", 401);
    }

    const existingSubscription = await fetchUserSubscription(user.id);
    if (
      existingSubscription &&
      blocksNewSubscriptionCheckout(existingSubscription.status)
    ) {
      return jsonError(
        copy.activeSubscriptionExists,
        "SUBSCRIPTION_ALREADY_ACTIVE",
        409
      );
    }

    const { planId, billingInterval, origin } = parsed.data;
    const stripe = createStripeClient();
    const customerId = await getOrCreateStripeCustomer({
      stripe,
      userId: user.id,
      email: user.email,
    });

    const priceId = await resolveSubscriptionPriceId(
      stripe,
      planId as PaidSubscriptionPlan,
      billingInterval as SubscriptionBillingInterval
    );
    const priceConfig = getSubscriptionPriceConfig(planId, billingInterval);
    const baseUrl = getSiteUrl() || "http://localhost:3000";
    const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
      ? [
          {
            price: priceId,
            quantity: 1,
          },
        ]
      : [
          {
            price_data: {
              currency: "jpy",
              unit_amount: priceConfig.amountYen,
              recurring: {
                interval: billingInterval,
              },
              product_data: {
                name: `Persta.AI ${planId} plan`,
                description: `${getSubscriptionMonthlyPercoins(planId)} monthly Percoins`,
                metadata: {
                  plan: planId,
                  billingInterval,
                },
              },
            },
            quantity: 1,
          },
        ];

    const subscriptionReturnUrl = `${normalizedBaseUrl}${ROUTES.CREDITS_PURCHASE}?tab=subscription`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      success_url: subscriptionReturnUrl,
      cancel_url: subscriptionReturnUrl,
      line_items: lineItems,
      metadata: {
        userId: user.id,
        plan: planId,
        billingInterval,
        ...(origin ? { origin } : {}),
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan: planId,
          billingInterval,
        },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return jsonError(
        copy.checkoutUrlFailed,
        "SUBSCRIPTION_CHECKOUT_URL_FAILED",
        500
      );
    }

    // 課金の手前の記録(支払いを始めた)。応答を返したあとに書く(支払い画面へ移るのを待たせない)
    const checkoutSessionId = session.id;
    runAfterResponse(() => recordMonetizationEvent({
      userId: user.id,
      eventType: "checkout_start",
      origin: origin ?? null,
      product: `subscription:${planId}:${billingInterval}`,
      stripeSessionId: checkoutSessionId,
    }));

    return NextResponse.json({
      checkoutUrl: session.url,
      mode: "stripe",
    });
  } catch (error) {
    console.error("[Subscription] Checkout creation failed:", error);
    return jsonError(
      copy.checkoutPrepareFailed,
      "SUBSCRIPTION_CHECKOUT_PREPARE_FAILED",
      500
    );
  }
}
