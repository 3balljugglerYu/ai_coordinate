import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SubscriptionBillingInterval,
  SubscriptionPlan,
} from "@/features/subscription/subscription-config";

/**
 * サブスクの請求(invoice.paid)の見分けと、支払いだけの行(record_subscription_payment)の記録。
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

/** 売上を記録する請求(必要なところだけ。checkout の支払いからも作る) */
export interface SubscriptionPaymentInvoice {
  id: string;
  /** 金額が分からないときは null(売上に数えない) */
  amount_paid: number | null;
  currency: string | null;
  livemode: boolean;
  status_transitions?: { paid_at?: number | null } | null;
}

/** 円の請求の売上(円以外・金額が分からないときは null) */
export function revenueYenOfPayment(payment: SubscriptionPaymentInvoice): number | null {
  if ((payment.currency ?? "").toLowerCase() !== "jpy") return null;
  return normalizeRevenueYen(payment.amount_paid);
}

/** 支払った時刻(ISO)。分からなければ null */
export function paidAtOfPayment(payment: SubscriptionPaymentInvoice): string | null {
  const seconds = payment.status_transitions?.paid_at ?? null;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * プランを上げたときの日割りの請求の支払いを、支払いだけの行(量0の subscription・paymentOnly)で記録する
 * (付与は change-service.ts が金額なしで行う)。0円・円以外は記録しない。
 * 同じ請求の売上は1行だけ(RPC が付与の関数と同じロックの中で、付与の行にもう売上があれば書かない)。
 */
export async function recordSubscriptionChangePayment(
  supabase: SupabaseClient,
  params: {
    userId: string;
    plan: SubscriptionPlan;
    billingInterval: SubscriptionBillingInterval | null;
    invoice: SubscriptionPaymentInvoice;
  },
): Promise<SubscriptionChangePaymentResult> {
  const { invoice } = params;
  const revenueYen = revenueYenOfPayment(invoice);
  if (!revenueYen) {
    if ((invoice.currency ?? "").toLowerCase() !== "jpy") {
      console.warn("[Stripe Webhook] Skip non-JPY subscription payment", {
        invoiceId: invoice.id,
        currency: invoice.currency,
      });
    }
    return "skipped";
  }

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
      paidAt: paidAtOfPayment(invoice),
    },
  });

  if (error) {
    throw new Error(error.message);
  }
  return data === true ? "recorded" : "duplicate";
}

/** 支払いだけの行の種類(管理画面の表示に使う)。付与の行なら null */
export function getSubscriptionPaymentKind(
  metadata: Record<string, unknown> | null | undefined,
): "plan_change" | "payment" | null {
  if (metadata?.paymentOnly !== true) return null;
  return metadata.revenueSource === "stripe_subscription_change" ? "plan_change" : "payment";
}

/** 支払いだけの行に付ける印(管理画面の「最近の購入」で付与の行と見分ける)。付与の行なら空 */
export function subscriptionPaymentLabelSuffix(
  metadata: Record<string, unknown> | null | undefined,
): string {
  const kind = getSubscriptionPaymentKind(metadata);
  if (kind === "plan_change") return "（プラン変更の支払い）";
  if (kind === "payment") return "（支払い）";
  return "";
}
