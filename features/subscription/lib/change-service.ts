import { revalidateTag } from "next/cache";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchUserSubscription,
  type UserSubscription,
} from "@/features/subscription/lib/server-api";
import {
  getImmediateSubscriptionGrantAmount,
  getSubscriptionChangeKind,
  isImmediateSubscriptionChange,
  requiresIntervalChangeConfirmation,
  type SubscriptionChangeKind,
  type SubscriptionChangePreview,
} from "@/features/subscription/lib/change-policy";
import {
  createStripeClient,
  getBillingIntervalFromStripeSubscription,
  getCustomerId,
  getSubscriptionItem,
  resolveSubscriptionPriceId,
  toIsoTimestamp,
} from "@/features/subscription/lib/stripe-utils";
import { createYearlyPercoinGrantState } from "@/features/subscription/lib/yearly-grant-schedule";
import {
  isActiveSubscriptionStatus,
  type PaidSubscriptionPlan,
  type SubscriptionBillingInterval,
} from "@/features/subscription/subscription-config";

class SubscriptionChangeServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

interface ActiveSubscriptionContext {
  stripe: Stripe;
  userSubscription: UserSubscription;
  stripeSubscription: Stripe.Subscription;
  currentItem: Stripe.SubscriptionItem;
  currentPlan: PaidSubscriptionPlan;
  currentBillingInterval: SubscriptionBillingInterval;
  customerId: string;
}

export interface SubscriptionChangeResult {
  changeKind: SubscriptionChangeKind;
  effectiveAt: string;
  scheduled: boolean;
  grantAmount: number;
}

function getScheduleId(subscription: Stripe.Subscription) {
  if (!subscription.schedule) {
    return null;
  }

  return typeof subscription.schedule === "string"
    ? subscription.schedule
    : subscription.schedule.id;
}

function getInvoiceAmounts(invoice: Stripe.Invoice) {
  const lines = invoice.lines.data ?? [];
  let priceAmountYen = 0;
  let creditAmountYen = 0;

  for (const line of lines) {
    const amount = line.amount ?? 0;
    if (amount >= 0) {
      priceAmountYen += amount;
    } else {
      creditAmountYen += Math.abs(amount);
    }
  }

  return {
    priceAmountYen,
    creditAmountYen,
    amountDueYen: invoice.amount_due ?? invoice.total ?? priceAmountYen - creditAmountYen,
    currency: invoice.currency ?? "jpy",
  };
}

function isInvoiceSettled(invoice: Stripe.Invoice) {
  return (
    invoice.status === "paid" ||
    invoice.amount_due === 0 ||
    invoice.amount_remaining === 0 ||
    invoice.amount_paid >= invoice.amount_due
  );
}

async function getActiveSubscriptionContext(
  userId: string
): Promise<ActiveSubscriptionContext> {
  const userSubscription = await fetchUserSubscription(userId);
  if (
    !userSubscription ||
    !isActiveSubscriptionStatus(userSubscription.status) ||
    !userSubscription.stripe_subscription_id ||
    !userSubscription.stripe_customer_id ||
    userSubscription.plan === "free" ||
    !userSubscription.billing_interval
  ) {
    throw new SubscriptionChangeServiceError(
      "No active subscription found.",
      "ACTIVE_SUBSCRIPTION_NOT_FOUND",
      409
    );
  }

  const stripe = createStripeClient();
  const stripeSubscription = await stripe.subscriptions.retrieve(
    userSubscription.stripe_subscription_id,
    {
      expand: ["latest_invoice.payment_intent", "schedule"],
    }
  );

  const currentItem = getSubscriptionItem(stripeSubscription);
  const customerId = getCustomerId(stripeSubscription.customer);
  const currentBillingInterval =
    getBillingIntervalFromStripeSubscription(stripeSubscription) ??
    userSubscription.billing_interval;

  if (!currentItem || !customerId || !currentBillingInterval) {
    throw new SubscriptionChangeServiceError(
      "Active subscription context is incomplete.",
      "ACTIVE_SUBSCRIPTION_NOT_FOUND",
      409
    );
  }

  return {
    stripe,
    userSubscription: {
      ...userSubscription,
      billing_interval: currentBillingInterval,
    },
    stripeSubscription,
    currentItem,
    currentPlan: userSubscription.plan as PaidSubscriptionPlan,
    currentBillingInterval,
    customerId,
  };
}

async function clearPendingCancellation(
  ctx: ActiveSubscriptionContext
): Promise<ActiveSubscriptionContext> {
  const hasCancelAt = ctx.stripeSubscription.cancel_at != null;
  const hasCancelAtPeriodEnd =
    ctx.stripeSubscription.cancel_at_period_end === true;

  if (!hasCancelAt && !hasCancelAtPeriodEnd) {
    return ctx;
  }

  // Stripe's flexible billing mode uses `cancel_at` (not the deprecated
  // `cancel_at_period_end`) when the Billing Portal cancels a subscription.
  // Sending both fields together can be rejected, so only send the field
  // that is currently set.
  const updateParams: Stripe.SubscriptionUpdateParams = {
    proration_behavior: "none",
  };
  if (hasCancelAt) {
    updateParams.cancel_at = null;
  }
  if (hasCancelAtPeriodEnd) {
    updateParams.cancel_at_period_end = false;
  }

  const stripeSubscription = await ctx.stripe.subscriptions.update(
    ctx.stripeSubscription.id,
    updateParams
  );

  const currentItem = getSubscriptionItem(stripeSubscription);
  if (!currentItem) {
    throw new SubscriptionChangeServiceError(
      "Subscription item missing after cancel reset.",
      "SUBSCRIPTION_ITEM_NOT_FOUND",
      500
    );
  }

  return {
    ...ctx,
    stripeSubscription,
    currentItem,
  };
}

async function releaseExistingSchedule(ctx: ActiveSubscriptionContext) {
  const schedule = getScheduleId(ctx.stripeSubscription);

  if (!schedule) {
    return;
  }

  await ctx.stripe.subscriptionSchedules.release(schedule);
}

async function upsertSubscriptionRecord(params: {
  userId: string;
  customerId: string;
  subscription: Stripe.Subscription;
  plan: PaidSubscriptionPlan;
  billingInterval: SubscriptionBillingInterval;
  scheduledPlan?: PaidSubscriptionPlan | null;
  scheduledBillingInterval?: SubscriptionBillingInterval | null;
  scheduledChangeAt?: string | null;
  lastPercoinGrantAt?: string | null;
  nextPercoinGrantAt?: string | null;
}) {
  const supabase = createAdminClient();
  const item = getSubscriptionItem(params.subscription);

  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.customerId,
      stripe_subscription_id: params.subscription.id,
      plan: params.plan,
      status: params.subscription.status,
      billing_interval: params.billingInterval,
      current_period_start: toIsoTimestamp(item?.current_period_start ?? null),
      current_period_end: toIsoTimestamp(item?.current_period_end ?? null),
      scheduled_plan: params.scheduledPlan ?? null,
      scheduled_billing_interval: params.scheduledBillingInterval ?? null,
      scheduled_change_at: params.scheduledChangeAt ?? null,
      last_percoin_grant_at:
        params.billingInterval === "year"
          ? params.lastPercoinGrantAt ?? null
          : null,
      next_percoin_grant_at:
        params.billingInterval === "year"
          ? params.nextPercoinGrantAt ?? null
          : null,
      cancel_at_period_end: params.subscription.cancel_at_period_end ?? false,
      cancel_at: toIsoTimestamp(params.subscription.cancel_at),
      canceled_at: toIsoTimestamp(params.subscription.canceled_at),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new SubscriptionChangeServiceError(
      error.message,
      "SUBSCRIPTION_RECORD_UPSERT_FAILED",
      500
    );
  }
}

async function grantSubscriptionPercoins(params: {
  userId: string;
  amount: number;
  invoiceId: string;
}) {
  if (params.amount <= 0) {
    return 0;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("grant_subscription_percoins", {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_invoice_id: params.invoiceId,
  });

  if (error) {
    throw new SubscriptionChangeServiceError(
      error.message,
      "SUBSCRIPTION_GRANT_FAILED",
      500
    );
  }

  return typeof data === "number" ? data : params.amount;
}

function revalidateSubscriptionSurfaces(userId: string) {
  try {
    revalidateTag(`subscription-ui-${userId}`, { expire: 0 });
    revalidateTag(`my-page-${userId}`, { expire: 0 });
    revalidateTag(`my-page-credits-${userId}`, { expire: 0 });
    revalidateTag(`coordinate-${userId}`, { expire: 0 });
    revalidateTag(`user-profile-${userId}`, { expire: 0 });
  } catch (error) {
    console.warn("[Subscription] revalidateTag failed (non-fatal):", error);
  }
}

async function createImmediateChangeInvoicePreview(params: {
  ctx: ActiveSubscriptionContext;
  targetPriceId: string;
}) {
  const { ctx, targetPriceId } = params;
  const scheduleId = getScheduleId(ctx.stripeSubscription);

  if (!scheduleId) {
    return ctx.stripe.invoices.createPreview({
      customer: ctx.customerId,
      subscription: ctx.stripeSubscription.id,
      subscription_details: {
        billing_cycle_anchor: "now",
        cancel_at_period_end: false,
        proration_behavior: "create_prorations",
        items: [
          {
            id: ctx.currentItem.id,
            price: targetPriceId,
            quantity: ctx.currentItem.quantity ?? 1,
          },
        ],
      },
    });
  }

  const currentPriceId =
    typeof ctx.currentItem.price === "string"
      ? ctx.currentItem.price
      : ctx.currentItem.price.id;
  const schedule = await ctx.stripe.subscriptionSchedules.retrieve(scheduleId);
  const currentPhaseStart =
    schedule.current_phase?.start_date ??
    ctx.currentItem.current_period_start ??
    Math.floor(Date.now() / 1000);

  return ctx.stripe.invoices.createPreview({
    schedule: scheduleId,
    schedule_details: {
      end_behavior: "release",
      proration_behavior: "create_prorations",
      phases: [
        {
          start_date: currentPhaseStart,
          end_date: "now",
          items: [
            {
              price: currentPriceId,
              quantity: ctx.currentItem.quantity ?? 1,
            },
          ],
        },
        {
          start_date: "now",
          billing_cycle_anchor: "phase_start",
          items: [
            {
              price: targetPriceId,
              quantity: ctx.currentItem.quantity ?? 1,
            },
          ],
        },
      ],
    },
  });
}

export async function createSubscriptionChangePreview(params: {
  userId: string;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
}): Promise<SubscriptionChangePreview> {
  const ctx = await getActiveSubscriptionContext(params.userId);
  const changeKind = getSubscriptionChangeKind({
    currentPlan: ctx.currentPlan,
    currentBillingInterval: ctx.currentBillingInterval,
    targetPlan: params.targetPlan,
    targetBillingInterval: params.targetBillingInterval,
  });

  if (changeKind === "no_change") {
    throw new SubscriptionChangeServiceError(
      "No plan change requested.",
      "NO_CHANGE_REQUESTED",
      400
    );
  }

  const currentPeriodEnd = toIsoTimestamp(ctx.currentItem.current_period_end ?? null);

  if (!isImmediateSubscriptionChange(changeKind)) {
    return {
      changeKind,
      currentPlan: ctx.currentPlan,
      currentBillingInterval: ctx.currentBillingInterval,
      targetPlan: params.targetPlan,
      targetBillingInterval: params.targetBillingInterval,
      effectiveAt: currentPeriodEnd ?? new Date().toISOString(),
      currentPeriodEnd,
      confirmationRequired: requiresIntervalChangeConfirmation(changeKind),
      isImmediate: false,
      priceAmountYen: null,
      creditAmountYen: null,
      amountDueYen: 0,
      currency: "jpy",
      grantAmount: 0,
    };
  }

  const targetPriceId = await resolveSubscriptionPriceId(
    ctx.stripe,
    params.targetPlan,
    params.targetBillingInterval
  );

  if (!targetPriceId) {
    throw new SubscriptionChangeServiceError(
      "Target price not found.",
      "SUBSCRIPTION_TARGET_PRICE_NOT_FOUND",
      503
    );
  }

  const preview = await createImmediateChangeInvoicePreview({
    ctx,
    targetPriceId,
  });

  const amounts = getInvoiceAmounts(preview);

  return {
    changeKind,
    currentPlan: ctx.currentPlan,
    currentBillingInterval: ctx.currentBillingInterval,
    targetPlan: params.targetPlan,
    targetBillingInterval: params.targetBillingInterval,
    effectiveAt: new Date().toISOString(),
    currentPeriodEnd,
    confirmationRequired: requiresIntervalChangeConfirmation(changeKind),
    isImmediate: true,
    priceAmountYen: amounts.priceAmountYen,
    creditAmountYen: amounts.creditAmountYen,
    amountDueYen: amounts.amountDueYen,
    currency: amounts.currency,
    grantAmount: getImmediateSubscriptionGrantAmount({
      changeKind,
      currentPlan: ctx.currentPlan,
      currentBillingInterval: ctx.currentBillingInterval,
      targetPlan: params.targetPlan,
      targetBillingInterval: params.targetBillingInterval,
    }),
  };
}

async function performImmediateChange(params: {
  ctx: ActiveSubscriptionContext;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
  changeKind: SubscriptionChangeKind;
}): Promise<SubscriptionChangeResult> {
  const { ctx, targetPlan, targetBillingInterval, changeKind } = params;
  const targetPriceId = await resolveSubscriptionPriceId(
    ctx.stripe,
    targetPlan,
    targetBillingInterval
  );

  if (!targetPriceId) {
    throw new SubscriptionChangeServiceError(
      "Target price not found.",
      "SUBSCRIPTION_TARGET_PRICE_NOT_FOUND",
      503
    );
  }

  const updated = await ctx.stripe.subscriptions.update(ctx.stripeSubscription.id, {
    items: [
      {
        id: ctx.currentItem.id,
        price: targetPriceId,
        quantity: ctx.currentItem.quantity ?? 1,
      },
    ],
    billing_cycle_anchor: "now",
    proration_behavior: "create_prorations",
    payment_behavior: "pending_if_incomplete",
    expand: ["latest_invoice.payment_intent", "pending_update"],
  });

  if (updated.pending_update) {
    throw new SubscriptionChangeServiceError(
      "The subscription payment did not complete.",
      "SUBSCRIPTION_PAYMENT_FAILED",
      402
    );
  }

  const latestInvoice =
    typeof updated.latest_invoice === "string"
      ? await ctx.stripe.invoices.retrieve(updated.latest_invoice, {
          expand: ["payment_intent"],
        })
      : updated.latest_invoice;

  if (!latestInvoice?.id) {
    throw new SubscriptionChangeServiceError(
      "Immediate changes require an invoice.",
      "SUBSCRIPTION_INVOICE_NOT_FOUND",
      500
    );
  }

  if (!isInvoiceSettled(latestInvoice)) {
    throw new SubscriptionChangeServiceError(
      "The subscription payment did not complete.",
      "SUBSCRIPTION_PAYMENT_FAILED",
      402
    );
  }

  const updatedItem = getSubscriptionItem(updated);
  const yearlyGrantState =
    targetBillingInterval === "year"
      ? createYearlyPercoinGrantState({
          currentPeriodStart: toIsoTimestamp(
            updatedItem?.current_period_start ?? null
          ),
          currentPeriodEnd: toIsoTimestamp(updatedItem?.current_period_end ?? null),
        })
      : {
          lastPercoinGrantAt: null,
          nextPercoinGrantAt: null,
        };

  await upsertSubscriptionRecord({
    userId: ctx.userSubscription.user_id,
    customerId: ctx.customerId,
    subscription: updated,
    plan: targetPlan,
    billingInterval: targetBillingInterval,
    scheduledPlan: null,
    scheduledBillingInterval: null,
    scheduledChangeAt: null,
    lastPercoinGrantAt: yearlyGrantState.lastPercoinGrantAt,
    nextPercoinGrantAt: yearlyGrantState.nextPercoinGrantAt,
  });

  const grantAmount = await grantSubscriptionPercoins({
    userId: ctx.userSubscription.user_id,
    amount: getImmediateSubscriptionGrantAmount({
      changeKind,
      currentPlan: ctx.currentPlan,
      currentBillingInterval: ctx.currentBillingInterval,
      targetPlan,
      targetBillingInterval,
    }),
    invoiceId: latestInvoice.id,
  });

  revalidateSubscriptionSurfaces(ctx.userSubscription.user_id);

  return {
    changeKind,
    effectiveAt:
      toIsoTimestamp(getSubscriptionItem(updated)?.current_period_start ?? null) ??
      new Date().toISOString(),
    scheduled: false,
    grantAmount,
  };
}

async function performScheduledChange(params: {
  ctx: ActiveSubscriptionContext;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
  changeKind: SubscriptionChangeKind;
}): Promise<SubscriptionChangeResult> {
  const { ctx, targetPlan, targetBillingInterval, changeKind } = params;
  const targetPriceId = await resolveSubscriptionPriceId(
    ctx.stripe,
    targetPlan,
    targetBillingInterval
  );

  if (!targetPriceId) {
    throw new SubscriptionChangeServiceError(
      "Target price not found.",
      "SUBSCRIPTION_TARGET_PRICE_NOT_FOUND",
      503
    );
  }

  const currentPriceId =
    typeof ctx.currentItem.price === "string"
      ? ctx.currentItem.price
      : ctx.currentItem.price.id;
  const phaseStart =
    ctx.currentItem.current_period_start ?? Math.floor(Date.now() / 1000);
  const phaseEnd = ctx.currentItem.current_period_end ?? null;

  if (!phaseEnd) {
    throw new SubscriptionChangeServiceError(
      "Current period end is missing.",
      "SUBSCRIPTION_PERIOD_END_NOT_FOUND",
      500
    );
  }

  const createdSchedule = await ctx.stripe.subscriptionSchedules.create({
    from_subscription: ctx.stripeSubscription.id,
  });

  await ctx.stripe.subscriptionSchedules.update(createdSchedule.id, {
    end_behavior: "release",
    phases: [
      {
        start_date: phaseStart,
        end_date: phaseEnd,
        items: [
          {
            price: currentPriceId,
            quantity: ctx.currentItem.quantity ?? 1,
          },
        ],
        metadata: {
          userId: ctx.userSubscription.user_id,
          plan: ctx.currentPlan,
          billingInterval: ctx.currentBillingInterval,
        },
      },
      {
        start_date: phaseEnd,
        billing_cycle_anchor: "phase_start",
        items: [
          {
            price: targetPriceId,
            quantity: ctx.currentItem.quantity ?? 1,
          },
        ],
        metadata: {
          userId: ctx.userSubscription.user_id,
          plan: targetPlan,
          billingInterval: targetBillingInterval,
        },
      },
    ],
  });

  await upsertSubscriptionRecord({
    userId: ctx.userSubscription.user_id,
    customerId: ctx.customerId,
    subscription: ctx.stripeSubscription,
    plan: ctx.currentPlan,
    billingInterval: ctx.currentBillingInterval,
    scheduledPlan: targetPlan,
    scheduledBillingInterval: targetBillingInterval,
    scheduledChangeAt: toIsoTimestamp(phaseEnd),
    lastPercoinGrantAt:
      ctx.currentBillingInterval === "year"
        ? ctx.userSubscription.last_percoin_grant_at
        : null,
    nextPercoinGrantAt:
      ctx.currentBillingInterval === "year"
        ? ctx.userSubscription.next_percoin_grant_at
        : null,
  });

  revalidateSubscriptionSurfaces(ctx.userSubscription.user_id);

  return {
    changeKind,
    effectiveAt: toIsoTimestamp(phaseEnd) ?? new Date().toISOString(),
    scheduled: true,
    grantAmount: 0,
  };
}

export async function changeSubscriptionPlan(params: {
  userId: string;
  targetPlan: PaidSubscriptionPlan;
  targetBillingInterval: SubscriptionBillingInterval;
  confirmedIntervalChange: boolean;
}): Promise<SubscriptionChangeResult> {
  let ctx = await getActiveSubscriptionContext(params.userId);
  const changeKind = getSubscriptionChangeKind({
    currentPlan: ctx.currentPlan,
    currentBillingInterval: ctx.currentBillingInterval,
    targetPlan: params.targetPlan,
    targetBillingInterval: params.targetBillingInterval,
  });

  if (changeKind === "no_change") {
    throw new SubscriptionChangeServiceError(
      "No plan change requested.",
      "NO_CHANGE_REQUESTED",
      400
    );
  }

  if (
    requiresIntervalChangeConfirmation(changeKind) &&
    !params.confirmedIntervalChange
  ) {
    throw new SubscriptionChangeServiceError(
      "Interval change confirmation is required.",
      "INTERVAL_CONFIRMATION_REQUIRED",
      400
    );
  }

  ctx = await clearPendingCancellation(ctx);
  await releaseExistingSchedule(ctx);

  if (isImmediateSubscriptionChange(changeKind)) {
    return performImmediateChange({
      ctx,
      targetPlan: params.targetPlan,
      targetBillingInterval: params.targetBillingInterval,
      changeKind,
    });
  }

  return performScheduledChange({
    ctx,
    targetPlan: params.targetPlan,
    targetBillingInterval: params.targetBillingInterval,
    changeKind,
  });
}

export async function cancelScheduledSubscriptionChange(params: {
  userId: string;
}): Promise<{ canceled: true }> {
  let ctx = await getActiveSubscriptionContext(params.userId);
  const hasScheduledChange =
    (typeof ctx.stripeSubscription.schedule === "string" &&
      ctx.stripeSubscription.schedule.length > 0) ||
    ctx.stripeSubscription.schedule != null ||
    (ctx.userSubscription.scheduled_plan != null &&
      ctx.userSubscription.scheduled_billing_interval != null);

  if (!hasScheduledChange) {
    throw new SubscriptionChangeServiceError(
      "No scheduled subscription change found.",
      "SCHEDULED_CHANGE_NOT_FOUND",
      409
    );
  }

  ctx = await clearPendingCancellation(ctx);
  await releaseExistingSchedule(ctx);

  await upsertSubscriptionRecord({
    userId: ctx.userSubscription.user_id,
    customerId: ctx.customerId,
    subscription: ctx.stripeSubscription,
    plan: ctx.currentPlan,
    billingInterval: ctx.currentBillingInterval,
    scheduledPlan: null,
    scheduledBillingInterval: null,
    scheduledChangeAt: null,
    lastPercoinGrantAt:
      ctx.currentBillingInterval === "year"
        ? ctx.userSubscription.last_percoin_grant_at
        : null,
    nextPercoinGrantAt:
      ctx.currentBillingInterval === "year"
        ? ctx.userSubscription.next_percoin_grant_at
        : null,
  });

  revalidateSubscriptionSurfaces(ctx.userSubscription.user_id);

  return { canceled: true };
}

export async function resumeSubscriptionCancellation(params: {
  userId: string;
}): Promise<{ resumed: true }> {
  const ctx = await getActiveSubscriptionContext(params.userId);

  const hasPendingCancellation =
    ctx.stripeSubscription.cancel_at_period_end === true ||
    ctx.stripeSubscription.cancel_at != null ||
    ctx.userSubscription.cancel_at_period_end === true ||
    ctx.userSubscription.cancel_at != null;

  if (!hasPendingCancellation) {
    throw new SubscriptionChangeServiceError(
      "No pending cancellation to resume.",
      "PENDING_CANCELLATION_NOT_FOUND",
      409
    );
  }

  const updatedCtx = await clearPendingCancellation(ctx);

  await upsertSubscriptionRecord({
    userId: updatedCtx.userSubscription.user_id,
    customerId: updatedCtx.customerId,
    subscription: updatedCtx.stripeSubscription,
    plan: updatedCtx.currentPlan,
    billingInterval: updatedCtx.currentBillingInterval,
    scheduledPlan:
      updatedCtx.userSubscription.scheduled_plan === "free"
        ? null
        : (updatedCtx.userSubscription.scheduled_plan as PaidSubscriptionPlan | null),
    scheduledBillingInterval:
      updatedCtx.userSubscription.scheduled_billing_interval,
    scheduledChangeAt: updatedCtx.userSubscription.scheduled_change_at,
    lastPercoinGrantAt:
      updatedCtx.currentBillingInterval === "year"
        ? updatedCtx.userSubscription.last_percoin_grant_at
        : null,
    nextPercoinGrantAt:
      updatedCtx.currentBillingInterval === "year"
        ? updatedCtx.userSubscription.next_percoin_grant_at
        : null,
  });

  revalidateSubscriptionSurfaces(updatedCtx.userSubscription.user_id);

  return { resumed: true };
}

export function isSubscriptionChangeServiceError(
  error: unknown
): error is SubscriptionChangeServiceError {
  return error instanceof SubscriptionChangeServiceError;
}

export function getSubscriptionChangeErrorStatus(error: unknown) {
  return isSubscriptionChangeServiceError(error) ? error.status : 500;
}

export function getSubscriptionChangeErrorCode(error: unknown) {
  return isSubscriptionChangeServiceError(error)
    ? error.code
    : "SUBSCRIPTION_CHANGE_FAILED";
}
