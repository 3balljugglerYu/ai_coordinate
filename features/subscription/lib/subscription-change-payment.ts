import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SubscriptionBillingInterval,
  SubscriptionPlan,
} from "@/features/subscription/subscription-config";

/**
 * サブスクの請求(invoice.paid)の見分けと、プランを途中で上げたときの支払いの記録。
 * 計画: docs/planning/subscription-change-revenue-recording-plan.md(案A・2026-10-26 ユーザー決定)
 *
 * プランを上げたとき(change-service.ts の即時の変更)は、日割りの請求が払われる。ペルコインの付与は
 * change-service.ts が金額なしで行うので、ここでは「支払いだけ」を量0の subscription の行で記録する。
 * - 同じ請求は1行だけ(RPC が `payment:<請求 ID>` の一意の索引で止める。Stripe が送り直しても増えない)
 * - 0円・円以外の請求は記録しない
 * - 本番かテストかは、請求そのもの(invoice.livemode)で決める(本番の URL でテストの通知を受けることがあるため)
 * - 売上は metadata.revenueYen を、今の決まり(isRevenueTransaction)がそのまま数える
 *
 * ⚠️ 月額→年額は予約の変更(期間の終わりに切り替わる)で、日割りの請求は出ない。
 * その年額の請求は毎月の更新と同じ「付与」の経路で、付与の行と一緒に売上が記録される。
 */

export type SubscriptionInvoiceKind = "grant" | "payment_only";

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

/**
 * invoice.paid の請求をどう扱うか。
 * - grant: 毎月の更新・日割りの無いプラン変更(ペルコインを付け、付与の行に売上も載せる)
 * - payment_only: 日割りの行があるプラン変更(支払いだけを記録する)
 * - null: それ以外(はじめての契約は checkout.session.completed が扱う)
 */
export function classifySubscriptionInvoice(invoice: Stripe.Invoice): SubscriptionInvoiceKind | null {
  if (invoice.billing_reason === "subscription_cycle") return "grant";
  if (invoice.billing_reason === "subscription_update") {
    return hasProrationLine(invoice) ? "payment_only" : "grant";
  }
  return null;
}

/** 売上の円。数でなければ null、マイナスは0にする */
export function normalizeRevenueYen(value?: number | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(value, 0);
  }
  return null;
}

/** サブスクの売上の metadata(付与の行と支払いだけの行で同じ形にする) */
export function buildSubscriptionRevenueMetadata(params: {
  plan: SubscriptionPlan;
  billingInterval: SubscriptionBillingInterval | null;
  revenueYen: number | null;
  revenueSource: "stripe_subscription" | "stripe_subscription_change";
  mode: "live" | "test";
}): Record<string, unknown> {
  return {
    plan: params.plan,
    billingInterval: params.billingInterval,
    revenueYen: params.revenueYen,
    revenueSource: params.revenueSource,
    mode: params.mode,
  };
}

export type SubscriptionChangePaymentResult = "recorded" | "duplicate" | "skipped";

export async function recordSubscriptionChangePayment(
  supabase: SupabaseClient,
  params: {
    userId: string;
    plan: SubscriptionPlan;
    billingInterval: SubscriptionBillingInterval | null;
    invoice: Pick<Stripe.Invoice, "id" | "amount_paid" | "currency" | "livemode" | "status_transitions">;
  },
): Promise<SubscriptionChangePaymentResult> {
  const { invoice } = params;
  const revenueYen = normalizeRevenueYen(invoice.amount_paid);
  if (!revenueYen) {
    return "skipped";
  }
  if ((invoice.currency ?? "").toLowerCase() !== "jpy") {
    console.warn("[Stripe Webhook] Skip non-JPY subscription change payment", {
      invoiceId: invoice.id,
      currency: invoice.currency,
    });
    return "skipped";
  }

  const paidAtSeconds = invoice.status_transitions?.paid_at ?? null;
  const { data, error } = await supabase.rpc("record_subscription_payment", {
    p_user_id: params.userId,
    p_invoice_id: invoice.id,
    p_metadata: {
      ...buildSubscriptionRevenueMetadata({
        plan: params.plan,
        billingInterval: params.billingInterval,
        revenueYen,
        revenueSource: "stripe_subscription_change",
        mode: invoice.livemode ? "live" : "test",
      }),
      // 付与の行と同じキーでも請求 ID を持つ(RPC は invoiceId も入れる)
      invoice_id: invoice.id,
      // 行の created_at は処理した時刻なので、支払った時刻を別に残す(送り直しで日がずれても分かるように)
      paidAt: paidAtSeconds ? new Date(paidAtSeconds * 1000).toISOString() : null,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  return data === true ? "recorded" : "duplicate";
}
