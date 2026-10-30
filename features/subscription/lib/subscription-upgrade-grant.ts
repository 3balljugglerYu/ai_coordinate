import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getImmediateSubscriptionGrantAmount,
  getSubscriptionChangeKind,
  isImmediateSubscriptionChange,
} from "./change-policy";
import {
  getBillingIntervalFromStripePrice,
  getSubscriptionPlanFromStripePrice,
} from "./stripe-utils";
import { isProrationLine } from "./subscription-change-payment";
import type {
  PaidSubscriptionPlan,
  SubscriptionBillingInterval,
} from "@/features/subscription/subscription-config";

/**
 * プランを上げたときの差のペルコインを、その請求が払われたときの Stripe の通知(invoice.paid)の側でも付ける。
 *
 * ふだんは change-service.ts が、支払いが済んだあとに同じ請求 ID で差を付ける。通知の側は保険で、
 * 同じ請求 ID で付けにいく(付与の RPC が請求 ID で重複を止めるので、二重には付かない)。
 * 次のときに、支払ったのにペルコインが付かないのを防ぐ。
 * - change-service.ts の付与が失敗した(DB の一時的な失敗など)
 * - Stripe のダッシュボードなどで、アプリと同じ上げ方(今日から新しい期間)でプランを上げた
 *
 * 前と後のプランは、その請求の明細から決める(請求が払われたときに1回だけ届き、時点がずれない)。
 * - 前の価格: 日割りでマイナスの行(前のプランの残りの期間の返金)
 * - 新しい価格: 日割りでないプラスの行(今日からの新しい期間の代金)
 * 新しい期間の代金が無い請求(期間を区切り直さずに上げた)は付けない。わずかな日割りの支払いで、
 * 月の量の差がまるごと付いてしまうため。付けるのは同じ期間(月額どうし・年額どうし)でプランを
 * 上げたとき(same_interval_upgrade)で、量は change-service.ts と同じ決まり。
 */

export interface SubscriptionUpgrade {
  previousPlan: PaidSubscriptionPlan;
  currentPlan: PaidSubscriptionPlan;
  billingInterval: SubscriptionBillingInterval;
  grantAmount: number;
}

/** 明細の価格(新しい SDK の pricing.price_details と、古い通知の price の両方を見る) */
export function priceOfLine(line: Stripe.InvoiceLineItem): Stripe.Price | string | null {
  const price = line.pricing?.price_details?.price;
  if (price) return price;
  const legacy = (line as unknown as { price?: Stripe.Price | string | null }).price;
  return legacy ?? null;
}

/** 請求の明細から、前の価格(日割りの返金)と新しい価格(新しい期間の代金)を探す。無ければ null */
export function findUpgradeLinePrices(
  invoice: Stripe.Invoice
): { previous: Stripe.Price | string; current: Stripe.Price | string } | null {
  const lines = invoice.lines?.data ?? [];
  const previousLine = lines.find((line) => isProrationLine(line) && line.amount < 0);
  const currentLine = lines.find((line) => !isProrationLine(line) && line.amount > 0);
  const previous = previousLine ? priceOfLine(previousLine) : null;
  const current = currentLine ? priceOfLine(currentLine) : null;
  return previous && current ? { previous, current } : null;
}

/**
 * プランの引き上げを見分け、差を出す。違えば null。
 * 明細の価格が ID だけのときは loadPrice で読む(lookup_key でプランを決めるため)。
 */
export async function resolveUpgradeFromInvoice(
  invoice: Stripe.Invoice,
  loadPrice: (priceId: string) => Promise<Stripe.Price | null>
): Promise<SubscriptionUpgrade | null> {
  const prices = findUpgradeLinePrices(invoice);
  if (!prices) return null;

  const resolve = async (price: Stripe.Price | string) =>
    typeof price === "string" ? loadPrice(price) : price;
  const [before, after] = await Promise.all([resolve(prices.previous), resolve(prices.current)]);

  const previousPlan = getSubscriptionPlanFromStripePrice(before);
  const previousInterval = getBillingIntervalFromStripePrice(before);
  const currentPlan = getSubscriptionPlanFromStripePrice(after);
  const currentInterval = getBillingIntervalFromStripePrice(after);
  if (!previousPlan || !previousInterval || !currentPlan || !currentInterval) {
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

/**
 * その請求ですでに付いたサブスクのペルコインの量(無ければ0)。
 * change-service.ts で付与の RPC が0を返したとき、通知の側が先に付けていないかを見るのに使う。
 * 読めなかったときはログに残して0を返す(支払いは済んでいるので、プラン変更そのものは失敗にしない)。
 */
export async function readGrantedSubscriptionAmount(
  supabase: SupabaseClient,
  params: { userId: string; invoiceId: string }
): Promise<number> {
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", params.userId)
    .eq("transaction_type", "subscription")
    .eq("stripe_payment_intent_id", params.invoiceId)
    .maybeSingle();
  if (error) {
    console.error("[Subscription] Failed to read granted subscription percoins", {
      invoiceId: params.invoiceId,
      message: error.message,
    });
    return 0;
  }
  return typeof data?.amount === "number" ? data.amount : 0;
}

/**
 * 差を付ける(同じ請求 ID ですでに付いていれば、RPC は0を返して何もしない)。
 * 付けた量を返す。売上は載せない(支払いの行で数える)。失敗したら投げる(Stripe に送り直させる)。
 */
export async function grantSubscriptionUpgradeDifference(
  supabase: SupabaseClient,
  params: { userId: string; upgrade: SubscriptionUpgrade; invoice: Pick<Stripe.Invoice, "id" | "livemode"> }
): Promise<number> {
  const { data, error } = await supabase.rpc("grant_subscription_percoins", {
    p_user_id: params.userId,
    p_amount: params.upgrade.grantAmount,
    p_invoice_id: params.invoice.id,
    p_metadata: {
      plan: params.upgrade.currentPlan,
      previousPlan: params.upgrade.previousPlan,
      billingInterval: params.upgrade.billingInterval,
      grantSource: "stripe_invoice_paid_upgrade",
      mode: params.invoice.livemode ? "live" : "test",
    },
  });
  if (error) {
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : 0;
}
