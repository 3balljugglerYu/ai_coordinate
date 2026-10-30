/**
 * プランを途中で変えたときの支払いを、売上として記録する(案A)。
 *
 * ここで守ること:
 *  - 日割りの行がある subscription_update の請求は「支払いだけを記録する」(ペルコインは付けない)
 *  - 毎月の更新と、日割りの無いプラン変更の請求は、今までどおり付与する
 *  - それ以外の請求(はじめての契約など)は、ここでは扱わない
 *  - 記録は RPC record_subscription_payment に、プラン・期間・売上(円)・本番かテストかを渡す
 *  - 0円の請求は記録しない
 *  - RPC が失敗したら投げる(Stripe に送り直させて、記録の漏れを防ぐ)
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasProrationLine,
  isSubscriptionChangePaymentInvoice,
  recordSubscriptionChangePayment,
  shouldGrantOnSubscriptionInvoicePaid,
} from "@/features/subscription/lib/subscription-change-payment";

function invoice(
  billingReason: string,
  lines: Array<Record<string, unknown>> = [],
): Stripe.Invoice {
  return { billing_reason: billingReason, lines: { data: lines } } as unknown as Stripe.Invoice;
}

const PRORATION_LINE = {
  parent: { type: "subscription_item_details", subscription_item_details: { proration: true } },
};
const LEGACY_PRORATION_LINE = { proration: true };
const NORMAL_LINE = {
  parent: { type: "subscription_item_details", subscription_item_details: { proration: false } },
};

describe("請求の見分け", () => {
  it.each([
    ["日割りの行があるプラン変更", invoice("subscription_update", [NORMAL_LINE, PRORATION_LINE]), true, false],
    ["古い形の日割りの行があるプラン変更", invoice("subscription_update", [LEGACY_PRORATION_LINE]), true, false],
    ["日割りの無いプラン変更", invoice("subscription_update", [NORMAL_LINE]), false, true],
    ["毎月の更新", invoice("subscription_cycle", [NORMAL_LINE]), false, true],
    ["はじめての契約", invoice("subscription_create", [NORMAL_LINE]), false, false],
  ])("%s: 支払いだけ=%s・付与=%s", (_label, inv, changePayment, grant) => {
    expect(isSubscriptionChangePaymentInvoice(inv)).toBe(changePayment);
    expect(shouldGrantOnSubscriptionInvoicePaid(inv)).toBe(grant);
  });

  it("行が無い請求は日割りではない", () => {
    expect(hasProrationLine(invoice("subscription_update", []))).toBe(false);
  });
});

describe("recordSubscriptionChangePayment", () => {
  function client(result: { data: unknown; error: { message: string } | null }) {
    const rpc = jest.fn(async () => result);
    return { supabase: { rpc } as unknown as SupabaseClient, rpc };
  }

  const params = {
    userId: "u1",
    plan: "standard" as const,
    billingInterval: "month" as const,
    invoiceId: "in_123",
    paidAmountYen: 1480,
    mode: "live" as const,
  };

  it("プラン・期間・売上・本番かを RPC に渡し、書けたら true", async () => {
    const { supabase, rpc } = client({ data: true, error: null });

    await expect(recordSubscriptionChangePayment(supabase, params)).resolves.toBe(true);

    expect(rpc).toHaveBeenCalledWith("record_subscription_payment", {
      p_user_id: "u1",
      p_invoice_id: "in_123",
      p_metadata: {
        plan: "standard",
        billingInterval: "month",
        revenueYen: 1480,
        revenueSource: "stripe_subscription_change",
        mode: "live",
      },
    });
  });

  it("同じ請求の2回目(RPC が false)は false", async () => {
    const { supabase } = client({ data: false, error: null });

    await expect(recordSubscriptionChangePayment(supabase, params)).resolves.toBe(false);
  });

  it.each([0, -100, null, undefined, Number.NaN])("支払いが %p 円なら記録しない", async (paid) => {
    const { supabase, rpc } = client({ data: true, error: null });

    await expect(recordSubscriptionChangePayment(supabase, { ...params, paidAmountYen: paid })).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("RPC が失敗したら投げる(Stripe に送り直させる)", async () => {
    const { supabase } = client({ data: null, error: { message: "db down" } });

    await expect(recordSubscriptionChangePayment(supabase, params)).rejects.toThrow("db down");
  });
});
