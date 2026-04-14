import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getUser } from "@/lib/auth";
import { ROUTES } from "@/constants";
import { env, getSiteUrl } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscriptionRouteCopy } from "@/features/subscription/lib/route-copy";

export async function POST(request: NextRequest) {
  const copy = getSubscriptionRouteCopy(getRouteLocale(request));

  try {
    const stripeSecretKey = env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return jsonError(
        copy.portalSessionFailed,
        "SUBSCRIPTION_PORTAL_UNAVAILABLE",
        503
      );
    }

    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SUBSCRIPTION_AUTH_REQUIRED", 401);
    }

    const supabase = createAdminClient();
    const { data: subscription, error } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[Subscription] Failed to load portal target:", error);
      return jsonError(
        copy.portalSessionFailed,
        "SUBSCRIPTION_PORTAL_FETCH_FAILED",
        500
      );
    }

    if (!subscription?.stripe_customer_id) {
      return jsonError(
        copy.portalUnavailable,
        "SUBSCRIPTION_PORTAL_NOT_FOUND",
        404
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-12-15.clover",
    });
    const returnUrl = `${(getSiteUrl() || "http://localhost:3000").replace(/\/$/, "")}${ROUTES.CREDITS_PURCHASE}?tab=subscription`;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[Subscription] Failed to create billing portal session:", error);
    return jsonError(
      copy.portalSessionFailed,
      "SUBSCRIPTION_PORTAL_SESSION_FAILED",
      500
    );
  }
}
