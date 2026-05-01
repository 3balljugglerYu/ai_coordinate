import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import Stripe from "stripe";
import {
  getStripeSecretKeyForMode,
  getStripeSecretKeyForVerification,
  getStripeWebhookSecrets,
  isStripeTestMode,
} from "@/lib/env";
import {
  getPercoinsFromPriceId,
  STRIPE_PRICE_ID_TO_PERCOINS,
} from "@/features/credits/lib/stripe-price-mapping";
import { recordPercoinPurchase } from "@/features/credits/lib/percoin-service";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSubscriptionMonthlyPercoins,
  normalizeSubscriptionPlan,
  normalizeSubscriptionStatus,
  type PaidSubscriptionPlan,
  type SubscriptionBillingInterval,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import { getSubscriptionPlanFromStripeSubscription } from "@/features/subscription/lib/stripe-utils";
import { createYearlyPercoinGrantState } from "@/features/subscription/lib/yearly-grant-schedule";

type SubscriptionRecord = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: string;
  billing_interval: SubscriptionBillingInterval | null;
  scheduled_plan?: SubscriptionPlan | null;
  scheduled_billing_interval?: SubscriptionBillingInterval | null;
  scheduled_change_at?: string | null;
  last_percoin_grant_at?: string | null;
  next_percoin_grant_at?: string | null;
};

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2025-12-15.clover",
  });
}

function getStringValue(value: string | Stripe.MetadataParam | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toIsoTimestamp(value?: number | null): string | null {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getSubscriptionId(
  subscription:
    | string
    | Stripe.Subscription
    | null
    | undefined
) {
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

function getBillingIntervalFromSubscription(
  subscription: Stripe.Subscription
): SubscriptionBillingInterval | null {
  const interval = subscription.items.data[0]?.price.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : null;
}

function getSubscriptionPeriodStart(
  subscription: Stripe.Subscription
): number | null {
  return subscription.items.data[0]?.current_period_start ?? null;
}

function getSubscriptionPeriodEnd(
  subscription: Stripe.Subscription
): number | null {
  return subscription.items.data[0]?.current_period_end ?? null;
}

function getBillingIntervalFromMetadata(
  metadata?: Stripe.Metadata | null
): SubscriptionBillingInterval | null {
  const value = metadata?.billingInterval;
  return value === "month" || value === "year" ? value : null;
}

function getPlanFromMetadata(
  metadata?: Stripe.Metadata | null
): SubscriptionPlan | null {
  const value = getStringValue(metadata?.plan);
  return value ? normalizeSubscriptionPlan(value) : null;
}

function getPlanFromSubscription(
  subscription: Stripe.Subscription
): PaidSubscriptionPlan | null {
  return getSubscriptionPlanFromStripeSubscription(subscription);
}

function normalizeRevenueYen(value?: number | null): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return Math.max(value, 0);
  }

  return null;
}

function getSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) {
    return null;
  }

  return typeof subscription === "string" ? subscription : subscription.id;
}

async function revalidateSubscriptionSurfaces(userId: string) {
  try {
    revalidateTag(`subscription-ui-${userId}`, { expire: 0 });
    revalidateTag(`my-page-${userId}`, { expire: 0 });
    revalidateTag(`my-page-credits-${userId}`, { expire: 0 });
    revalidateTag(`coordinate-${userId}`, { expire: 0 });
    revalidateTag(`user-profile-${userId}`, { expire: 0 });
  } catch (error) {
    console.warn("[Stripe Webhook] revalidateTag failed (non-fatal):", error);
  }
}

async function findSubscriptionRecordByStripeIds(params: {
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const supabase = createAdminClient();

  if (params.subscriptionId) {
    const { data } = await supabase
      .from("user_subscriptions")
      .select(
        "user_id, stripe_customer_id, stripe_subscription_id, plan, status, billing_interval, scheduled_plan, scheduled_billing_interval, scheduled_change_at, last_percoin_grant_at, next_percoin_grant_at"
      )
      .eq("stripe_subscription_id", params.subscriptionId)
      .maybeSingle<SubscriptionRecord>();

    if (data) {
      return data;
    }
  }

  if (params.customerId) {
    const { data } = await supabase
      .from("user_subscriptions")
      .select(
        "user_id, stripe_customer_id, stripe_subscription_id, plan, status, billing_interval, scheduled_plan, scheduled_billing_interval, scheduled_change_at, last_percoin_grant_at, next_percoin_grant_at"
      )
      .eq("stripe_customer_id", params.customerId)
      .maybeSingle<SubscriptionRecord>();

    if (data) {
      return data;
    }
  }

  return null;
}

async function upsertSubscriptionFromStripe(params: {
  userId: string;
  customerId: string | null;
  subscription: Stripe.Subscription;
  fallbackPlan?: SubscriptionPlan;
  fallbackBillingInterval?: SubscriptionBillingInterval | null;
  existingRecord?: SubscriptionRecord | null;
  lastPercoinGrantAt?: string | null;
  nextPercoinGrantAt?: string | null;
}) {
  const supabase = createAdminClient();
  const plan =
    getPlanFromSubscription(params.subscription) ??
    getPlanFromMetadata(params.subscription.metadata) ??
    params.fallbackPlan ??
    "free";
  const billingInterval =
    getBillingIntervalFromSubscription(params.subscription) ??
    params.fallbackBillingInterval ??
    null;

  const shouldClearScheduledChange =
    params.existingRecord?.scheduled_plan != null &&
    params.existingRecord?.scheduled_billing_interval != null &&
    params.existingRecord.scheduled_plan === plan &&
    params.existingRecord.scheduled_billing_interval === billingInterval;

  const payload: Record<string, unknown> = {
    user_id: params.userId,
    stripe_customer_id: params.customerId,
    stripe_subscription_id: params.subscription.id,
    plan,
    status: normalizeSubscriptionStatus(params.subscription.status),
    billing_interval: billingInterval,
    current_period_start: toIsoTimestamp(
      getSubscriptionPeriodStart(params.subscription)
    ),
    current_period_end: toIsoTimestamp(
      getSubscriptionPeriodEnd(params.subscription)
    ),
    last_percoin_grant_at:
      billingInterval === "year"
        ? params.lastPercoinGrantAt ??
          params.existingRecord?.last_percoin_grant_at ??
          null
        : null,
    next_percoin_grant_at:
      billingInterval === "year"
        ? params.nextPercoinGrantAt ??
          params.existingRecord?.next_percoin_grant_at ??
          null
        : null,
    cancel_at_period_end: params.subscription.cancel_at_period_end ?? false,
    cancel_at: toIsoTimestamp(params.subscription.cancel_at),
    canceled_at: toIsoTimestamp(params.subscription.canceled_at),
  };

  if (shouldClearScheduledChange) {
    payload.scheduled_plan = null;
    payload.scheduled_billing_interval = null;
    payload.scheduled_change_at = null;
  }

  const { error } = await supabase
    .from("user_subscriptions")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message);
  }

  return {
    plan,
    billingInterval,
  };
}

async function updateSubscriptionStatus(params: {
  subscriptionId?: string | null;
  customerId?: string | null;
  status: string;
  canceledAt?: number | null;
}) {
  const supabase = createAdminClient();
  const normalizedStatus = normalizeSubscriptionStatus(params.status);
  const update: Record<string, unknown> = {
    status: normalizedStatus,
    canceled_at: toIsoTimestamp(params.canceledAt),
    scheduled_plan: null,
    scheduled_billing_interval: null,
    scheduled_change_at: null,
  };
  if (normalizedStatus === "canceled") {
    update.cancel_at = null;
    update.cancel_at_period_end = false;
  }
  let query = supabase.from("user_subscriptions").update(update);

  if (params.subscriptionId) {
    query = query.eq("stripe_subscription_id", params.subscriptionId);
  } else if (params.customerId) {
    query = query.eq("stripe_customer_id", params.customerId);
  } else {
    return null;
  }

  const { data, error } = await query.select("user_id").maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  return data?.user_id ?? null;
}

async function grantSubscriptionPercoins(params: {
  userId: string;
  plan: SubscriptionPlan;
  billingInterval: SubscriptionBillingInterval | null;
  invoiceId: string;
  paidAmountYen?: number | null;
}) {
  const amount = getSubscriptionMonthlyPercoins(params.plan);
  if (amount <= 0) {
    return;
  }

  const revenueYen = normalizeRevenueYen(params.paidAmountYen);
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("grant_subscription_percoins", {
    p_user_id: params.userId,
    p_amount: amount,
    p_invoice_id: params.invoiceId,
    p_metadata: {
      plan: params.plan,
      billingInterval: params.billingInterval,
      revenueYen,
      revenueSource: "stripe_subscription",
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

function hasProrationLine(invoice: Stripe.Invoice) {
  const lines = invoice.lines.data ?? [];

  return lines.some((line) => {
    const prorationOnParent =
      line.parent?.type === "subscription_item_details" &&
      line.parent.subscription_item_details?.proration === true;

    // Some Stripe webhook payloads still include a legacy top-level proration flag
    // that is not present in the current SDK type definitions.
    const legacyProrationFlag =
      "proration" in line &&
      typeof line.proration === "boolean" &&
      line.proration === true;

    return prorationOnParent || legacyProrationFlag;
  });
}

function shouldHandleSubscriptionInvoicePaid(invoice: Stripe.Invoice) {
  if (invoice.billing_reason === "subscription_cycle") {
    return true;
  }

  if (invoice.billing_reason === "subscription_update") {
    return !hasProrationLine(invoice);
  }

  return false;
}

async function handlePercoinCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const userId = session.client_reference_id;
  if (!userId) {
    console.error("Missing client_reference_id in checkout session", {
      sessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
    return NextResponse.json(
      { error: "Missing client_reference_id" },
      { status: 400 }
    );
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) {
    console.error("Missing payment_intent in checkout session", {
      sessionId: session.id,
    });
    return NextResponse.json(
      { error: "Missing payment_intent" },
      { status: 400 }
    );
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ["data.price"],
  });

  if (!lineItems.data || lineItems.data.length === 0) {
    console.error("Missing line_items in checkout session", {
      sessionId: session.id,
    });
    return NextResponse.json({ error: "Missing line_items" }, { status: 400 });
  }

  const metadataPercoinAmount = session.metadata?.percoinAmount;
  const percoinsFromMetadata =
    metadataPercoinAmount != null
      ? parseInt(String(metadataPercoinAmount), 10)
      : null;

  const priceId =
    typeof lineItems.data[0].price === "string"
      ? lineItems.data[0].price
      : lineItems.data[0].price?.id;

  let percoins: number;
  if (percoinsFromMetadata != null && !Number.isNaN(percoinsFromMetadata)) {
    percoins = percoinsFromMetadata;
  } else if (!priceId) {
    console.error(
      "Missing price ID and metadata.percoinAmount in checkout session",
      {
        sessionId: session.id,
      }
    );
    return NextResponse.json({ error: "Missing price ID" }, { status: 400 });
  } else {
    const percoinsFromPrice = getPercoinsFromPriceId(priceId);
    if (percoinsFromPrice == null) {
      const amountTotal = lineItems.data[0].amount_total || session.amount_total || 0;
      const currency = session.currency || lineItems.data[0].price?.currency || "jpy";

      console.error(
        `[Stripe Webhook] Unknown price ID: ${priceId}. This must be added to the mapping or passed via metadata.`,
        {
          sessionId: session.id,
          priceId,
          amountTotal,
          currency,
          availablePriceIds: Object.keys(STRIPE_PRICE_ID_TO_PERCOINS),
        }
      );

      return NextResponse.json(
        { error: `Unknown price ID: ${priceId}.` },
        { status: 400 }
      );
    }
    percoins = percoinsFromPrice;
  }

  const supabase = createAdminClient();
  const { data: existingTransaction } = await supabase
    .from("credit_transactions")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existingTransaction) {
    return NextResponse.json({
      received: true,
      handled: true,
      idempotent: true,
      message: "Already processed",
    });
  }

  const customerEmail =
    typeof session.customer === "string"
      ? null
      : session.customer && "email" in session.customer
        ? session.customer.email
        : null;

  await recordPercoinPurchase({
    userId,
    percoinAmount: percoins,
    stripePaymentIntentId: paymentIntentId,
    metadata: {
      ...(priceId && { priceId }),
      checkoutSessionId: session.id,
      customerEmail,
      mode: isStripeTestMode() ? "test" : "live",
      revenueYen: normalizeRevenueYen(session.amount_total),
      revenueSource: "stripe_checkout",
    },
    supabaseClient: supabase,
  });

  await revalidateSubscriptionSurfaces(userId);

  return NextResponse.json({
    received: true,
    handled: true,
    userId,
    percoins,
    paymentIntentId,
  });
}

async function handleSubscriptionCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const userId =
    getStringValue(session.metadata?.userId) ??
    getStringValue(session.client_reference_id);
  const subscriptionId = getSubscriptionId(session.subscription);
  const customerId = getCustomerId(session.customer);
  const fallbackPlan = getPlanFromMetadata(session.metadata) ?? "free";
  const fallbackBillingInterval = getBillingIntervalFromMetadata(session.metadata);

  if (!userId || !subscriptionId) {
    console.error("[Stripe Webhook] Missing subscription checkout metadata", {
      sessionId: session.id,
      userId,
      subscriptionId,
    });
    return NextResponse.json(
      { error: "Missing subscription metadata" },
      { status: 400 }
    );
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const yearlyGrantState =
    fallbackBillingInterval === "year" ||
    getBillingIntervalFromSubscription(subscription) === "year"
      ? createYearlyPercoinGrantState({
          currentPeriodStart: toIsoTimestamp(
            getSubscriptionPeriodStart(subscription)
          ),
          currentPeriodEnd: toIsoTimestamp(getSubscriptionPeriodEnd(subscription)),
        })
      : {
          lastPercoinGrantAt: null,
          nextPercoinGrantAt: null,
        };
  const { plan, billingInterval } = await upsertSubscriptionFromStripe({
    userId,
    customerId,
    subscription,
    fallbackPlan,
    fallbackBillingInterval,
    lastPercoinGrantAt: yearlyGrantState.lastPercoinGrantAt,
    nextPercoinGrantAt: yearlyGrantState.nextPercoinGrantAt,
  });

  const invoiceId =
    (typeof session.invoice === "string" ? session.invoice : session.invoice?.id) ??
    session.id;

  await grantSubscriptionPercoins({
    userId,
    plan,
    billingInterval,
    invoiceId,
    paidAmountYen: session.amount_total,
  });
  await revalidateSubscriptionSurfaces(userId);

  return NextResponse.json({
    received: true,
    handled: true,
    mode: "subscription",
    userId,
    subscriptionId,
    invoiceId,
  });
}

async function handleSubscriptionInvoicePaid(
  stripe: Stripe,
  invoice: Stripe.Invoice
) {
  if (!shouldHandleSubscriptionInvoicePaid(invoice)) {
    return NextResponse.json({
      received: true,
      handled: false,
      eventType: "invoice.paid",
      reason: invoice.billing_reason,
    });
  }

  const subscriptionId = getSubscriptionIdFromInvoice(invoice);
  const customerId = getCustomerId(invoice.customer);
  const existingRecord = await findSubscriptionRecordByStripeIds({
    customerId,
    subscriptionId,
  });

  let userId = existingRecord?.user_id ?? null;
  let plan = existingRecord?.plan ?? "free";
  let billingInterval = existingRecord?.billing_interval ?? null;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    userId =
      userId ??
      getStringValue(subscription.metadata.userId) ??
      getStringValue(invoice.parent?.subscription_details?.metadata?.userId);
    plan =
      getPlanFromSubscription(subscription) ??
      getPlanFromMetadata(subscription.metadata) ??
      existingRecord?.plan ??
      "free";
    billingInterval =
      getBillingIntervalFromSubscription(subscription) ??
      getBillingIntervalFromMetadata(invoice.parent?.subscription_details?.metadata) ??
      existingRecord?.billing_interval ??
      null;

    if (userId) {
      const yearlyGrantState =
        billingInterval === "year"
          ? createYearlyPercoinGrantState({
              currentPeriodStart: toIsoTimestamp(
                getSubscriptionPeriodStart(subscription)
              ),
              currentPeriodEnd: toIsoTimestamp(
                getSubscriptionPeriodEnd(subscription)
              ),
            })
          : {
              lastPercoinGrantAt: null,
              nextPercoinGrantAt: null,
            };
      await upsertSubscriptionFromStripe({
        userId,
        customerId,
        subscription,
        existingRecord,
        fallbackPlan: plan,
        fallbackBillingInterval: billingInterval,
        lastPercoinGrantAt: yearlyGrantState.lastPercoinGrantAt,
        nextPercoinGrantAt: yearlyGrantState.nextPercoinGrantAt,
      });
    }
  }

  if (!userId) {
    console.error("[Stripe Webhook] Could not resolve subscription renewal user", {
      invoiceId: invoice.id,
      subscriptionId,
      customerId,
    });
    return NextResponse.json(
      { error: "Missing user for subscription renewal" },
      { status: 400 }
    );
  }

  await grantSubscriptionPercoins({
    userId,
    plan,
    billingInterval,
    invoiceId: invoice.id,
    paidAmountYen: invoice.amount_paid,
  });
  await revalidateSubscriptionSurfaces(userId);

  return NextResponse.json({
    received: true,
    handled: true,
    mode: "subscription_renewal",
    userId,
    invoiceId: invoice.id,
  });
}

async function handleSubscriptionUpdated(
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  // Stripe doesn't guarantee webhook delivery order. Always re-fetch the
  // subscription so a stale update event can't overwrite newer state like
  // cancel_at_period_end or billing interval changes.
  const latestSubscription = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ["latest_invoice.payment_intent", "schedule"],
  });
  const customerId = getCustomerId(latestSubscription.customer);
  const existingRecord = await findSubscriptionRecordByStripeIds({
    customerId,
    subscriptionId: latestSubscription.id,
  });
  const billingInterval =
    getBillingIntervalFromSubscription(latestSubscription) ??
    existingRecord?.billing_interval ??
    null;
  const userId =
    getStringValue(latestSubscription.metadata.userId) ??
    existingRecord?.user_id ??
    null;

  if (!userId) {
    console.error("[Stripe Webhook] Missing user for subscription update", {
      subscriptionId: latestSubscription.id,
      customerId,
    });
    return NextResponse.json(
      { error: "Missing user for subscription update" },
      { status: 400 }
    );
  }

  const shouldInitializeYearlyGrantState =
    billingInterval === "year" &&
    (existingRecord?.billing_interval !== "year" ||
      existingRecord?.last_percoin_grant_at == null ||
      existingRecord?.next_percoin_grant_at == null);
  const yearlyGrantState = shouldInitializeYearlyGrantState
    ? createYearlyPercoinGrantState({
        currentPeriodStart: toIsoTimestamp(
          getSubscriptionPeriodStart(latestSubscription)
        ),
        currentPeriodEnd: toIsoTimestamp(
          getSubscriptionPeriodEnd(latestSubscription)
        ),
      })
    : {
        lastPercoinGrantAt: null,
        nextPercoinGrantAt: null,
      };

  await upsertSubscriptionFromStripe({
    userId,
    customerId,
    subscription: latestSubscription,
    existingRecord,
    fallbackPlan: existingRecord?.plan ?? "free",
    fallbackBillingInterval: existingRecord?.billing_interval ?? null,
    lastPercoinGrantAt: yearlyGrantState.lastPercoinGrantAt,
    nextPercoinGrantAt: yearlyGrantState.nextPercoinGrantAt,
  });
  await revalidateSubscriptionSurfaces(userId);

  return NextResponse.json({
    received: true,
    handled: true,
    mode: "subscription_updated",
    userId,
    subscriptionId: latestSubscription.id,
  });
}

/**
 * Stripe webhook endpoint.
 * Handles one-time Percoin purchases and subscription lifecycle updates.
 */
export async function POST(request: NextRequest) {
  const webhookSecrets = getStripeWebhookSecrets();
  const verificationStripeSecretKey = getStripeSecretKeyForVerification();

  if (webhookSecrets.length === 0 || !verificationStripeSecretKey) {
    console.warn(
      "Stripe webhook secret(s) or secret key is not configured. Returning mock response."
    );
    return NextResponse.json({ mode: "mock", handled: true });
  }

  let verificationStripe: Stripe;
  try {
    verificationStripe = createStripeClient(verificationStripeSecretKey);
  } catch (error) {
    console.error("Failed to initialize Stripe:", error);
    return NextResponse.json(
      { error: "Failed to initialize Stripe" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  let lastSignatureError: unknown = null;
  try {
    let verifiedEvent: Stripe.Event | null = null;

    for (const webhookSecret of webhookSecrets) {
      try {
        verifiedEvent = verificationStripe.webhooks.constructEvent(
          body,
          signature,
          webhookSecret
        );
        break;
      } catch (error) {
        lastSignatureError = error;
      }
    }

    if (!verifiedEvent) {
      throw lastSignatureError ?? new Error("No webhook secret matched signature");
    }

    event = verifiedEvent;
    console.log(`[Stripe Webhook] Received event: ${event.type} (id: ${event.id})`);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const modeStripeSecretKey = getStripeSecretKeyForMode(event.livemode);
  if (!modeStripeSecretKey) {
    console.error("Stripe secret key for event mode is not configured", {
      livemode: event.livemode,
      eventId: event.id,
    });
    return NextResponse.json(
      { error: "Missing Stripe secret key for event mode" },
      { status: 500 }
    );
  }

  let stripe: Stripe;
  try {
    stripe = createStripeClient(modeStripeSecretKey);
  } catch (error) {
    console.error("Failed to initialize Stripe for event mode:", error);
    return NextResponse.json(
      { error: "Failed to initialize Stripe" },
      { status: 500 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          return await handleSubscriptionCheckoutCompleted(stripe, session);
        }
        return await handlePercoinCheckoutCompleted(stripe, session);
      }
      case "invoice.paid":
        return await handleSubscriptionInvoicePaid(
          stripe,
          event.data.object as Stripe.Invoice
        );
      case "customer.subscription.updated":
      case "customer.subscription.created":
        return await handleSubscriptionUpdated(
          stripe,
          event.data.object as Stripe.Subscription
        );
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await updateSubscriptionStatus({
          subscriptionId: subscription.id,
          customerId: getCustomerId(subscription.customer),
          status: "canceled",
          canceledAt: subscription.canceled_at ?? Math.floor(Date.now() / 1000),
        });
        if (userId) {
          await revalidateSubscriptionSurfaces(userId);
        }
        return NextResponse.json({
          received: true,
          handled: true,
          mode: "subscription_deleted",
          userId,
          subscriptionId: subscription.id,
        });
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const userId = await updateSubscriptionStatus({
          subscriptionId: getSubscriptionIdFromInvoice(invoice),
          customerId: getCustomerId(invoice.customer),
          status: "past_due",
        });
        if (userId) {
          await revalidateSubscriptionSurfaces(userId);
        }
        return NextResponse.json({
          received: true,
          handled: true,
          mode: "subscription_payment_failed",
          userId,
          invoiceId: invoice.id,
        });
      }
      default:
        return NextResponse.json({
          received: true,
          handled: false,
          eventType: event.type,
        });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("[Stripe Webhook] Error processing event:", {
      eventType: event.type,
      message: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" && { detail: err.message }),
      },
      { status: 500 }
    );
  }
}
