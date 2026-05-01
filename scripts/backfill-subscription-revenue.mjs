#!/usr/bin/env node
/**
 * Backfill subscription revenue into credit_transactions.metadata.revenueYen.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-subscription-revenue.mjs --from 2026-04-30 --to 2026-05-01 --stripe-mode live
 *   node --env-file=.env.local scripts/backfill-subscription-revenue.mjs --from 2026-04-30 --to 2026-05-01 --stripe-mode live --apply
 *
 * Default is dry-run. The script updates only subscription transactions that:
 * - do not already have numeric metadata.revenueYen, or lack plan metadata
 * - can be matched to a Stripe invoice or Checkout Session when revenue is missing
 * - have JPY currency when revenue is resolved from Stripe
 */

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);

function getArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(name) {
  return args.includes(name);
}

function printUsage() {
  console.log(`Usage:
  node --env-file=.env.local scripts/backfill-subscription-revenue.mjs --from YYYY-MM-DD --to YYYY-MM-DD [--stripe-mode live|test|default] [--apply]

Options:
  --from <date>         Inclusive lower bound for credit_transactions.created_at
  --to <date>           Exclusive upper bound for credit_transactions.created_at
  --stripe-mode <mode>  Stripe key selector. default uses STRIPE_SECRET_KEY first.
  --apply               Persist updates. Omit for dry-run.
`);
}

const from = getArg("--from");
const to = getArg("--to");
const stripeMode = getArg("--stripe-mode") ?? "default";
const shouldApply = hasFlag("--apply");

if (hasFlag("--help") || !from || !to) {
  printUsage();
  process.exit(hasFlag("--help") ? 0 : 1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function resolveStripeSecretKey(mode) {
  if (mode === "live") {
    return process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
  }

  if (mode === "test") {
    return process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;
  }

  if (mode !== "default") {
    throw new Error("--stripe-mode must be one of: live, test, default");
  }

  return (
    process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY_LIVE ||
    process.env.STRIPE_SECRET_KEY_TEST
  );
}

const stripeSecretKey = resolveStripeSecretKey(stripeMode);

if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
  console.error(
    "Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY"
  );
  process.exit(1);
}

function toIsoBound(value, endOfDay = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+09:00`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.toISOString();
}

function getInvoiceId(row) {
  const stripeId =
    typeof row.stripe_payment_intent_id === "string"
      ? row.stripe_payment_intent_id
      : null;
  const metadataInvoiceId =
    typeof row.metadata?.invoice_id === "string"
      ? row.metadata.invoice_id
      : null;

  return stripeId?.startsWith("in_")
    ? stripeId
    : metadataInvoiceId?.startsWith("in_")
      ? metadataInvoiceId
      : null;
}

function getCheckoutSessionId(row) {
  const stripeId =
    typeof row.stripe_payment_intent_id === "string"
      ? row.stripe_payment_intent_id
      : null;
  const metadataSessionId =
    typeof row.metadata?.checkoutSessionId === "string"
      ? row.metadata.checkoutSessionId
      : null;
  const metadataInvoiceId =
    typeof row.metadata?.invoice_id === "string"
      ? row.metadata.invoice_id
      : null;

  return stripeId?.startsWith("cs_")
    ? stripeId
    : metadataSessionId?.startsWith("cs_")
      ? metadataSessionId
      : metadataInvoiceId?.startsWith("cs_")
        ? metadataInvoiceId
        : null;
}

function toStripeCreatedRange(createdAt) {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) {
    return null;
  }

  return {
    gte: Math.floor((createdMs - 24 * 60 * 60 * 1000) / 1000),
    lte: Math.floor((createdMs + 24 * 60 * 60 * 1000) / 1000),
  };
}

function resolveInvoiceRevenue(invoice, source) {
  if (invoice.currency !== "jpy") {
    return {
      skipped: true,
      reason: `invoice currency is ${invoice.currency}`,
    };
  }

  return {
    revenueYen: invoice.amount_paid,
    source,
    stripeObjectId: invoice.id,
    currency: invoice.currency,
  };
}

function getMetadataString(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function hasMetadataKey(metadata, key) {
  return metadata != null && Object.prototype.hasOwnProperty.call(metadata, key);
}

function getMetadataMode() {
  if (stripeMode === "live" || stripeMode === "test") {
    return stripeMode;
  }

  return null;
}

function hasRevenueYen(row) {
  return (
    row.metadata &&
    typeof row.metadata.revenueYen === "number" &&
    Number.isFinite(row.metadata.revenueYen)
  );
}

function getPlanMetadata(subscription) {
  const plan = subscription?.plan;
  return plan === "light" || plan === "standard" || plan === "premium"
    ? plan
    : null;
}

function getBillingIntervalMetadata(subscription) {
  const billingInterval = subscription?.billing_interval;
  return billingInterval === "month" || billingInterval === "year"
    ? billingInterval
    : null;
}

function needsBackfill(row) {
  return (
    !hasRevenueYen(row) ||
    !hasMetadataKey(row.metadata, "mode") ||
    getMetadataString(row.metadata, "plan") === null ||
    getMetadataString(row.metadata, "billingInterval") === null
  );
}

async function resolveRevenueYen(stripe, row, subscription) {
  const lookupErrors = [];
  const invoiceId = getInvoiceId(row);
  if (invoiceId) {
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      return resolveInvoiceRevenue(invoice, "stripe_invoice_backfill");
    } catch (error) {
      lookupErrors.push(
        error instanceof Error
          ? `invoice lookup failed: ${error.message}`
          : "invoice lookup failed"
      );
    }
  }

  const checkoutSessionId = getCheckoutSessionId(row);
  if (checkoutSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      if (session.currency !== "jpy") {
        return {
          skipped: true,
          reason: `checkout session currency is ${session.currency}`,
        };
      }

      if (typeof session.amount_total !== "number") {
        return {
          skipped: true,
          reason: "checkout session amount_total is missing",
        };
      }

      return {
        revenueYen: session.amount_total,
        source: "stripe_checkout_session_backfill",
        stripeObjectId: session.id,
        currency: session.currency,
      };
    } catch (error) {
      lookupErrors.push(
        error instanceof Error
          ? `checkout session lookup failed: ${error.message}`
          : "checkout session lookup failed"
      );
    }
  }

  if (subscription?.stripe_subscription_id) {
    try {
      const created = toStripeCreatedRange(row.created_at);
      const invoices = await stripe.invoices.list({
        subscription: subscription.stripe_subscription_id,
        limit: 10,
        ...(created ? { created } : {}),
      });
      const paidInvoice = invoices.data.find(
        (invoice) => invoice.status === "paid" && invoice.amount_paid > 0
      );

      if (paidInvoice) {
        return resolveInvoiceRevenue(
          paidInvoice,
          "stripe_subscription_invoice_backfill"
        );
      }

      lookupErrors.push("subscription invoice list had no paid invoice");
    } catch (error) {
      lookupErrors.push(
        error instanceof Error
          ? `subscription invoice list failed: ${error.message}`
          : "subscription invoice list failed"
      );
    }
  }

  return {
    skipped: true,
    reason:
      lookupErrors.length > 0
        ? lookupErrors.join("; ")
        : "no Stripe invoice, Checkout Session, or subscription id found",
  };
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-12-15.clover",
});

async function main() {
  const fromIso = toIsoBound(from);
  const toIso = toIsoBound(to);

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, user_id, amount, transaction_type, stripe_payment_intent_id, metadata, created_at")
    .eq("transaction_type", "subscription")
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const candidates = rows.filter(
    (row) => needsBackfill(row)
  );
  const userIds = [...new Set(candidates.map((row) => row.user_id).filter(Boolean))];
  const subscriptionsByUserId = new Map();

  if (userIds.length > 0) {
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("user_subscriptions")
      .select("user_id, stripe_subscription_id, plan, billing_interval")
      .in("user_id", userIds);

    if (subscriptionsError) {
      throw new Error(subscriptionsError.message);
    }

    for (const subscription of subscriptions ?? []) {
      subscriptionsByUserId.set(subscription.user_id, subscription);
    }
  }

  console.log(
    `${shouldApply ? "APPLY" : "DRY-RUN"} subscription revenue backfill`
  );
  console.log(`Stripe mode: ${stripeMode}`);
  console.log(`Range: ${fromIso} <= created_at < ${toIso}`);
  console.log(`Fetched rows: ${rows.length}`);
  console.log(`Candidates: ${candidates.length}`);

  let updated = 0;
  let skipped = 0;

  for (const row of candidates) {
    const subscription = subscriptionsByUserId.get(row.user_id);
    const plan = getPlanMetadata(subscription);
    const billingInterval = getBillingIntervalMetadata(subscription);
    const resolved = hasRevenueYen(row)
      ? {
          revenueYen: row.metadata.revenueYen,
          source: getMetadataString(row.metadata, "revenueSource") ?? "existing",
          currency: getMetadataString(row.metadata, "revenueCurrency") ?? "jpy",
          stripeObjectId:
            getMetadataString(row.metadata, "revenueBackfillStripeObjectId") ??
            getInvoiceId(row) ??
            getCheckoutSessionId(row),
        }
      : await resolveRevenueYen(stripe, row, subscription);

    if (resolved.skipped) {
      skipped += 1;
      console.log(`SKIP ${row.id} ${row.created_at}: ${resolved.reason}`);
      continue;
    }

    const nextMetadata = {
      ...(row.metadata ?? {}),
      revenueYen: resolved.revenueYen,
      revenueSource: resolved.source,
      revenueCurrency: resolved.currency,
      revenueBackfilledAt: new Date().toISOString(),
      revenueBackfillStripeObjectId: resolved.stripeObjectId,
      mode: getMetadataMode(),
      ...(plan ? { plan } : {}),
      ...(billingInterval ? { billingInterval } : {}),
    };

    console.log(
      `${shouldApply ? "UPDATE" : "WOULD UPDATE"} ${row.id} ${row.created_at}: revenueYen=${resolved.revenueYen} source=${resolved.source} plan=${plan ?? "unknown"} billingInterval=${billingInterval ?? "unknown"}`
    );

    if (shouldApply) {
      const { error: updateError } = await supabase
        .from("credit_transactions")
        .update({ metadata: nextMetadata })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Failed to update ${row.id}: ${updateError.message}`);
      }
    }

    updated += 1;
  }

  console.log("---");
  console.log(`${shouldApply ? "Updated" : "Would update"}: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
