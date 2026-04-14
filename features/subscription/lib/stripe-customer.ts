import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

async function persistStripeCustomerId(params: {
  userId: string;
  customerId: string;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.customerId,
      stripe_subscription_id: null,
      plan: "free",
      status: "inactive",
      billing_interval: null,
      current_period_start: null,
      current_period_end: null,
      scheduled_plan: null,
      scheduled_billing_interval: null,
      scheduled_change_at: null,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error(
      "[Subscription] Failed to persist Stripe customer id:",
      error
    );
    throw new Error("Failed to persist Stripe customer.");
  }
}

export async function getOrCreateStripeCustomer(params: {
  stripe: Stripe;
  userId: string;
  email?: string | null;
}): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("user_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) {
    try {
      const customer = await params.stripe.customers.retrieve(
        existing.stripe_customer_id
      );

      // Test clock customers are useful for simulations but shouldn't be reused
      // for regular app-driven checkout flows after the simulation has ended.
      if (!customer.deleted && !customer.test_clock) {
        return existing.stripe_customer_id;
      }
    } catch (error) {
      console.warn(
        "[Subscription] Existing Stripe customer could not be reused. Creating a new customer.",
        {
          userId: params.userId,
          stripeCustomerId: existing.stripe_customer_id,
          error,
        }
      );
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", params.userId)
    .maybeSingle();

  const customer = await params.stripe.customers.create({
    email: params.email ?? undefined,
    name:
      typeof profile?.nickname === "string" && profile.nickname.trim().length > 0
        ? profile.nickname.trim()
        : undefined,
    metadata: {
      userId: params.userId,
      },
  });

  await persistStripeCustomerId({
    userId: params.userId,
    customerId: customer.id,
  });

  return customer.id;
}
