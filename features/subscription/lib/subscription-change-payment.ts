import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SubscriptionBillingInterval,
  SubscriptionPlan,
} from "@/features/subscription/subscription-config";

/**
 * プランを途中で変えたときの支払い(日割りの請求・月額→年額)を、売上として記録する。
 * 計画: docs/planning/subscription-change-revenue-recording-plan.md(案A・2026-10-26 ユーザー決定)
 *
 * - ペルコインは付けない(付与は change-service.ts が行う)。量0の subscription の行を1つ書く
 * - 同じ請求は1行だけ(RPC が `payment:<請求 ID>` の一意の索引で止める。Stripe が送り直しても増えない)
 * - 0円の請求は記録しない(売上が無い)
 * - 売上は metadata.revenueYen を、今の決まり(isRevenueTransaction)がそのまま数える
 */

/** 日割りの行があるか(新しい SDK の parent と、古い通知の proration の両方を見る) */
export function hasProrationLine(invoice: Stripe.Invoice): boolean {
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

/** プランを途中で変えたときの日割りの請求か(付与は change-service.ts 済み・支払いだけを記録する) */
export function isSubscriptionChangePaymentInvoice(invoice: Stripe.Invoice): boolean {
  return invoice.billing_reason === "subscription_update" && hasProrationLine(invoice);
}

/** 毎月の更新・日割りの無いプラン変更の請求か(ペルコインを付けて、支払いも一緒に記録する) */
export function shouldGrantOnSubscriptionInvoicePaid(invoice: Stripe.Invoice): boolean {
  if (invoice.billing_reason === "subscription_cycle") {
    return true;
  }
  if (invoice.billing_reason === "subscription_update") {
    return !hasProrationLine(invoice);
  }
  return false;
}

export async function recordSubscriptionChangePayment(
  supabase: SupabaseClient,
  params: {
    userId: string;
    plan: SubscriptionPlan;
    billingInterval: SubscriptionBillingInterval | null;
    invoiceId: string;
    paidAmountYen: number | null | undefined;
    mode: "live" | "test";
  },
): Promise<boolean> {
  const revenueYen =
    typeof params.paidAmountYen === "number" && Number.isFinite(params.paidAmountYen)
      ? Math.max(params.paidAmountYen, 0)
      : 0;
  if (revenueYen <= 0) {
    return false;
  }

  const { data, error } = await supabase.rpc("record_subscription_payment", {
    p_user_id: params.userId,
    p_invoice_id: params.invoiceId,
    p_metadata: {
      plan: params.plan,
      billingInterval: params.billingInterval,
      revenueYen,
      revenueSource: "stripe_subscription_change",
      mode: params.mode,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  return data === true;
}
