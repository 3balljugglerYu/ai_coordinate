/**
 * サブスクの請求の見分けと、プランを途中で上げたときの支払いの記録(案A)。
 *
 * ここで守ること:
 *  - 日割りの行がある subscription_update は「支払いだけ」、毎月の更新と日割りの無い変更は「付与」、それ以外は扱わない
 *  - 記録は RPC record_subscription_payment に、プラン・期間・売上(円)・本番かテストか・請求 ID・支払った時刻を渡す
 *  - 本番かテストかは請求の livemode で決める(本番の URL でテストの通知を受けても、本番の売上にしない)
 *  - 0円・円以外の請求は記録しない
 *  - 同じ請求の2回目(Stripe の送り直し)は duplicate
 *  - RPC が失敗したら投げる(Stripe に送り直させて、記録の漏れを防ぐ)
 *  - 支払いだけの行は、管理画面の売上に「プラン変更の支払い」として入る(isRevenueTransaction の決まりのまま)
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSubscriptionRevenueMetadata,
  classifySubscriptionInvoice,
  ensureSubscriptionRevenueRecorded,
  hasProrationLine,
  normalizeRevenueYen,
  recordSubscriptionChangePayment,
} from "@/features/subscription/lib/subscription-change-payment";
import { isRevenueTransaction } from "@/features/admin-dashboard/lib/revenue-transaction";
import { resolveTransactionRevenue } from "@/features/admin-dashboard/lib/purchase-value";

function invoice(billingReason: string, lines: Array<Record<string, unknown>> = []): Stripe.Invoice {
  return { billing_reason: billingReason, lines: { data: lines } } as unknown as Stripe.Invoice;
}

const PRORATION_LINE = {
  parent: { type: "subscription_item_details", subscription_item_details: { proration: true } },
};
const LEGACY_PRORATION_LINE = { proration: true };
const NORMAL_LINE = {
  parent: { type: "subscription_item_details", subscription_item_details: { proration: false } },
};

describe("classifySubscriptionInvoice", () => {
  it.each([
    ["日割りの行があるプラン変更", invoice("subscription_update", [NORMAL_LINE, PRORATION_LINE]), "payment_only"],
    ["古い形の日割りの行があるプラン変更", invoice("subscription_update", [LEGACY_PRORATION_LINE]), "payment_only"],
    ["日割りの無いプラン変更", invoice("subscription_update", [NORMAL_LINE]), "grant"],
    ["毎月の更新(月額→年額の切り替わりもここ)", invoice("subscription_cycle", [NORMAL_LINE]), "grant"],
    ["はじめての契約", invoice("subscription_create", [NORMAL_LINE]), null],
    ["手で作った請求", invoice("manual", []), null],
  ])("%s → %s", (_label, inv, expected) => {
    expect(classifySubscriptionInvoice(inv)).toBe(expected);
  });

  it("行が無い請求は日割りではない", () => {
    expect(hasProrationLine(invoice("subscription_update", []))).toBe(false);
  });
});

describe("normalizeRevenueYen", () => {
  it.each([
    [1480, 1480],
    [0, 0],
    [-100, 0],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
  ])("%p → %p", (input, expected) => {
    expect(normalizeRevenueYen(input as number | null | undefined)).toBe(expected);
  });
});

describe("recordSubscriptionChangePayment", () => {
  function client(result: { data: unknown; error: { message: string } | null }) {
    const rpc = jest.fn(async () => result);
    return { supabase: { rpc } as unknown as SupabaseClient, rpc };
  }

  const paidInvoice = {
    id: "in_123",
    amount_paid: 1480,
    currency: "jpy",
    livemode: true,
    status_transitions: { paid_at: 1_793_000_000 },
  } as unknown as Stripe.Invoice;

  const params = { userId: "u1", plan: "standard" as const, billingInterval: "month" as const, invoice: paidInvoice };

  it("プラン・期間・売上・本番か・請求 ID・支払った時刻を RPC に渡し、書けたら recorded", async () => {
    const { supabase, rpc } = client({ data: true, error: null });

    await expect(recordSubscriptionChangePayment(supabase, params)).resolves.toBe("recorded");

    expect(rpc).toHaveBeenCalledWith("record_subscription_payment", {
      p_user_id: "u1",
      p_invoice_id: "in_123",
      p_metadata: {
        plan: "standard",
        billingInterval: "month",
        revenueYen: 1480,
        revenueSource: "stripe_subscription_change",
        mode: "live",
        invoice_id: "in_123",
        paidAt: new Date(1_793_000_000 * 1000).toISOString(),
      },
    });
  });

  it("テストの請求(livemode=false)は、本番の URL で受けても mode=test にする", async () => {
    const { supabase, rpc } = client({ data: true, error: null });

    await recordSubscriptionChangePayment(supabase, {
      ...params,
      invoice: { ...paidInvoice, livemode: false } as Stripe.Invoice,
    });

    expect(rpc).toHaveBeenCalledWith(
      "record_subscription_payment",
      expect.objectContaining({ p_metadata: expect.objectContaining({ mode: "test" }) }),
    );
  });

  it("同じ請求の2回目(RPC が false)は duplicate", async () => {
    const { supabase } = client({ data: false, error: null });

    await expect(recordSubscriptionChangePayment(supabase, params)).resolves.toBe("duplicate");
  });

  it.each([
    ["0円", { amount_paid: 0 }],
    ["マイナス", { amount_paid: -100 }],
    ["円以外", { currency: "usd" }],
  ])("%sの請求は記録しない", async (_label, overrides) => {
    const { supabase, rpc } = client({ data: true, error: null });
    jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      recordSubscriptionChangePayment(supabase, {
        ...params,
        invoice: { ...paidInvoice, ...overrides } as Stripe.Invoice,
      }),
    ).resolves.toBe("skipped");
    expect(rpc).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it("RPC が失敗したら投げる(Stripe に送り直させる)", async () => {
    const { supabase } = client({ data: null, error: { message: "db down" } });

    await expect(recordSubscriptionChangePayment(supabase, params)).rejects.toThrow("db down");
  });
});

describe("支払いだけの行と管理画面の売上", () => {
  const metadata = {
    ...buildSubscriptionRevenueMetadata({
      plan: "standard",
      billingInterval: "month",
      revenueYen: 1480,
      revenueSource: "stripe_subscription_change",
      mode: "live",
    }),
    paymentOnly: true,
  };

  it("量0でも、本番の売上として数え、ラベルでプラン変更の支払いと分かる", () => {
    expect(isRevenueTransaction({ transaction_type: "subscription", amount: 0, metadata })).toBe(true);
    const { yenValue, label } = resolveTransactionRevenue({ amount: 0, transactionType: "subscription", metadata });
    expect(yenValue).toBe(1480);
    expect(label).toContain("プラン変更の支払い");
  });

  it("テストの支払いは売上に数えない", () => {
    expect(
      isRevenueTransaction({ transaction_type: "subscription", amount: 0, metadata: { ...metadata, mode: "test" } }),
    ).toBe(false);
  });
});

describe("ensureSubscriptionRevenueRecorded(付与のあとで、売上が記録されたかを確かめる)", () => {
  function client(grantRow: { metadata: Record<string, unknown> } | null) {
    interface Builder {
      select: () => Builder;
      eq: () => Builder;
      maybeSingle: () => Promise<{ data: typeof grantRow; error: null }>;
    }
    const builder: Builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: grantRow, error: null }),
    };
    const rpc = jest.fn(async () => ({ data: true, error: null }));
    return { supabase: { from: jest.fn(() => builder), rpc } as unknown as SupabaseClient, rpc };
  }

  const params = {
    userId: "u1",
    plan: "standard" as const,
    billingInterval: "month" as const,
    invoice: { id: "in_9", amount_paid: 1480, currency: "jpy", livemode: true },
  };

  it.each([
    ["数", 1480],
    ["文字", "1480"],
  ])("付与の行に売上(%s)があれば、何もしない(二重に数えない)", async (_label, revenueYen) => {
    const { supabase, rpc } = client({ metadata: { revenueYen, mode: "live" } });

    await expect(ensureSubscriptionRevenueRecorded(supabase, params)).resolves.toBe("already_recorded");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("付与の行が無い(無料のペルコインが上限で付与が0)なら、支払いだけの行で売上を記録する", async () => {
    const { supabase, rpc } = client(null);

    await expect(ensureSubscriptionRevenueRecorded(supabase, params)).resolves.toBe("recorded");
    expect(rpc).toHaveBeenCalledWith(
      "record_subscription_payment",
      expect.objectContaining({
        p_invoice_id: "in_9",
        p_metadata: expect.objectContaining({ revenueYen: 1480, revenueSource: "stripe_subscription", mode: "live" }),
      }),
    );
  });

  it("付与の行に売上が無い(change-service が差だけ金額なしで付けた)なら、支払いだけの行で記録する", async () => {
    const { supabase, rpc } = client({ metadata: { invoice_id: "in_9", granted_amount: 700 } });

    await expect(ensureSubscriptionRevenueRecorded(supabase, params)).resolves.toBe("recorded");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("付与の行を読めなかったら投げる(Stripe に送り直させる)", async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: null, error: { message: "db down" } }),
    };
    const supabase = { from: () => builder, rpc: jest.fn() } as unknown as SupabaseClient;

    await expect(ensureSubscriptionRevenueRecorded(supabase, params)).rejects.toThrow("db down");
  });

  it("管理画面では、付与の行に載らなかった支払いを「（支払い）」と出す", () => {
    const metadata = {
      ...buildSubscriptionRevenueMetadata({
        plan: "standard",
        billingInterval: "month",
        revenueYen: 1480,
        revenueSource: "stripe_subscription",
        mode: "live",
      }),
      paymentOnly: true,
    };
    expect(isRevenueTransaction({ transaction_type: "subscription", amount: 0, metadata })).toBe(true);
    expect(resolveTransactionRevenue({ amount: 0, transactionType: "subscription", metadata }).label).toContain("（支払い）");
  });
});
