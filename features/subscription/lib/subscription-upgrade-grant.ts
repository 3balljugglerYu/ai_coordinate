import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getImmediateSubscriptionGrantAmount,
  getSubscriptionChangeKind,
  isImmediateSubscriptionChange,
} from "./change-policy";
import {
  getBillingIntervalFromStripeSubscription,
  getSubscriptionPlanFromStripePrice,
  getSubscriptionPlanFromStripeSubscription,
} from "./stripe-utils";
import type {
  PaidSubscriptionPlan,
  SubscriptionBillingInterval,
} from "@/features/subscription/subscription-config";

/**
 * プランを上げたときの差のペルコインを、Stripe の通知(customer.subscription.updated)の側でも付ける。
 *
 * ふだんは change-service.ts が、支払いが済んだあとに同じ請求 ID で差を付ける。通知の側は保険で、
 * 同じ請求 ID で付けにいく(付与の RPC が請求 ID で重複を止めるので、二重には付かない)。
 * 次のときに、支払ったのにペルコインが付かないのを防ぐ。
 * - change-service.ts の付与が失敗した(DB の一時的な失敗など)
 * - Stripe のダッシュボードやポータルでプランを上げた(change-service.ts を通らない)
 *
 * 前のプランは、通知の「変わる前の値」(previous_attributes の items)の価格で決める。
 * change-service.ts は付与の前にサブスクの記録を新しいプランへ書き換えるので、記録からは分からない。
 * 付けるのは、同じ期間(月額どうし・年額どうし)でプランを上げたとき(same_interval_upgrade)で、
 * その変更の請求(billing_reason = subscription_update)が支払い済みのときだけ。量は change-service.ts と同じ決まり。
 */

export interface SubscriptionUpgrade {
  previousPlan: PaidSubscriptionPlan;
  currentPlan: PaidSubscriptionPlan;
  billingInterval: SubscriptionBillingInterval;
  grantAmount: number;
}

interface PreviousItemsAttributes {
  items?: { data?: Array<{ price?: Stripe.Price | string | null }> };
}

function previousPrice(previousAttributes: unknown): Stripe.Price | null {
  const items = (previousAttributes as PreviousItemsAttributes | null | undefined)?.items;
  const price = items?.data?.[0]?.price;
  return price && typeof price !== "string" ? price : null;
}

/** 通知の「変わる前の値」と今のサブスクから、同じ期間でのプランの引き上げを見分ける。違えば null */
export function resolveSubscriptionUpgrade(params: {
  previousAttributes: unknown;
  subscription: Stripe.Subscription;
}): SubscriptionUpgrade | null {
  const before = previousPrice(params.previousAttributes);
  if (!before) return null;

  const previousPlan = getSubscriptionPlanFromStripePrice(before);
  const previousInterval = before.recurring?.interval;
  const currentPlan = getSubscriptionPlanFromStripeSubscription(params.subscription);
  const currentInterval = getBillingIntervalFromStripeSubscription(params.subscription);
  if (
    !previousPlan ||
    !currentPlan ||
    !currentInterval ||
    (previousInterval !== "month" && previousInterval !== "year")
  ) {
    return null;
  }

  const changeKind = getSubscriptionChangeKind({
    currentPlan: previousPlan,
    currentBillingInterval: previousInterval,
    targetPlan: currentPlan,
    targetBillingInterval: currentInterval,
  });
  if (!isImmediateSubscriptionChange(changeKind)) return null;

  const grantAmount = getImmediateSubscriptionGrantAmount({
    changeKind,
    currentPlan: previousPlan,
    currentBillingInterval: previousInterval,
    targetPlan: currentPlan,
    targetBillingInterval: currentInterval,
  });
  if (grantAmount <= 0) return null;

  return { previousPlan, currentPlan, billingInterval: currentInterval, grantAmount };
}

/** その変更の請求が支払い済みか(古い請求の ID で付けないように、プラン変更の請求に限る) */
export function isSettledUpgradeInvoice(
  invoice: Stripe.Invoice | string | null | undefined
): invoice is Stripe.Invoice {
  return (
    !!invoice &&
    typeof invoice !== "string" &&
    !!invoice.id &&
    invoice.status === "paid" &&
    invoice.billing_reason === "subscription_update"
  );
}

/**
 * その請求ですでに付いたサブスクのペルコインの量(無ければ0)。
 * change-service.ts で付与の RPC が0を返したとき、通知の側が先に付けていないかを見るのに使う。
 */
export async function readGrantedSubscriptionAmount(
  supabase: SupabaseClient,
  params: { userId: string; invoiceId: string }
): Promise<number> {
  const { data } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", params.userId)
    .eq("transaction_type", "subscription")
    .eq("stripe_payment_intent_id", params.invoiceId)
    .maybeSingle();
  return typeof data?.amount === "number" ? data.amount : 0;
}

/**
 * 差を付ける(同じ請求 ID ですでに付いていれば、RPC は0を返して何もしない)。
 * 付けた量を返す。
 */
export async function grantSubscriptionUpgradeDifference(
  supabase: SupabaseClient,
  params: { userId: string; upgrade: SubscriptionUpgrade; invoice: Stripe.Invoice }
): Promise<number> {
  const { data, error } = await supabase.rpc("grant_subscription_percoins", {
    p_user_id: params.userId,
    p_amount: params.upgrade.grantAmount,
    p_invoice_id: params.invoice.id,
    p_metadata: {
      plan: params.upgrade.currentPlan,
      previousPlan: params.upgrade.previousPlan,
      billingInterval: params.upgrade.billingInterval,
      // 売上は record_subscription_payment の支払いの行で数える(ここには載せない)
      grantSource: "stripe_subscription_upgrade_webhook",
      mode: params.invoice.livemode ? "live" : "test",
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : 0;
}
