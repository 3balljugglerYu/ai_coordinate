import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeSubscriptionPlan,
  normalizeSubscriptionStatus,
  type SubscriptionBillingInterval,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/features/subscription/subscription-config";

export interface UserSubscription {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  billing_interval: SubscriptionBillingInterval | null;
  current_period_start: string | null;
  current_period_end: string | null;
  scheduled_plan: SubscriptionPlan | null;
  scheduled_billing_interval: SubscriptionBillingInterval | null;
  scheduled_change_at: string | null;
  last_percoin_grant_at: string | null;
  next_percoin_grant_at: string | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
}

function mapUserSubscription(
  value: Record<string, unknown> | null | undefined
): UserSubscription | null {
  if (!value || typeof value.user_id !== "string") {
    return null;
  }

  const billingInterval =
    value.billing_interval === "month" || value.billing_interval === "year"
      ? value.billing_interval
      : null;
  const scheduledBillingInterval =
    value.scheduled_billing_interval === "month" ||
    value.scheduled_billing_interval === "year"
      ? value.scheduled_billing_interval
      : null;

  const scheduledPlan =
    typeof value.scheduled_plan === "string"
      ? normalizeSubscriptionPlan(value.scheduled_plan)
      : null;

  return {
    user_id: value.user_id,
    stripe_customer_id:
      typeof value.stripe_customer_id === "string"
        ? value.stripe_customer_id
        : null,
    stripe_subscription_id:
      typeof value.stripe_subscription_id === "string"
        ? value.stripe_subscription_id
        : null,
    plan: normalizeSubscriptionPlan(
      typeof value.plan === "string" ? value.plan : null
    ),
    status: normalizeSubscriptionStatus(
      typeof value.status === "string" ? value.status : null
    ),
    billing_interval: billingInterval,
    current_period_start:
      typeof value.current_period_start === "string"
        ? value.current_period_start
        : null,
    current_period_end:
      typeof value.current_period_end === "string"
        ? value.current_period_end
        : null,
    scheduled_plan: scheduledPlan,
    scheduled_billing_interval: scheduledBillingInterval,
    scheduled_change_at:
      typeof value.scheduled_change_at === "string"
        ? value.scheduled_change_at
        : null,
    last_percoin_grant_at:
      typeof value.last_percoin_grant_at === "string"
        ? value.last_percoin_grant_at
        : null,
    next_percoin_grant_at:
      typeof value.next_percoin_grant_at === "string"
        ? value.next_percoin_grant_at
        : null,
    cancel_at_period_end: value.cancel_at_period_end === true,
    cancel_at:
      typeof value.cancel_at === "string" ? value.cancel_at : null,
    canceled_at:
      typeof value.canceled_at === "string" ? value.canceled_at : null,
  };
}

export async function fetchUserSubscription(
  userId: string,
  supabaseOverride?: SupabaseClient
): Promise<UserSubscription | null> {
  const supabase = supabaseOverride ?? createAdminClient();

  const { data, error } = await supabase
    .from("user_subscriptions")
    .select(
      "user_id, stripe_customer_id, stripe_subscription_id, plan, status, billing_interval, current_period_start, current_period_end, scheduled_plan, scheduled_billing_interval, scheduled_change_at, last_percoin_grant_at, next_percoin_grant_at, cancel_at_period_end, cancel_at, canceled_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[Subscription] Failed to fetch subscription:", error);
    return null;
  }

  return mapUserSubscription(data as Record<string, unknown> | null);
}

export const getUserSubscription = cache(
  async (
    userId: string,
    supabaseOverride?: SupabaseClient
  ): Promise<UserSubscription | null> =>
    fetchUserSubscription(userId, supabaseOverride)
);
