/**
 * プランを上げたときの差のペルコインを、Stripe の通知の側でも付ける(保険)。
 *
 * ここで守ること:
 *  - 前のプランは通知の「変わる前の値」(previous_attributes の items の価格)で決める
 *  - 付けるのは、同じ期間(月額どうし・年額どうし)でプランを上げたときだけ。量は change-service.ts と同じ
 *    (新しいプランの月の量 − 前のプランの月の量)
 *  - 下げた・期間を変えた・価格が変わっていない通知では付けない
 *  - その変更の請求(subscription_update)が支払い済みのときだけ付ける(古い請求 ID で付けない)
 *  - 付与の RPC に同じ請求 ID で渡す(すでに付いていれば RPC が0を返し、二重には付かない)
 *  - 売上は載せない(支払いの行で数える)・付与に失敗したら投げる(Stripe に送り直させる)
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grantSubscriptionUpgradeDifference,
  isSettledUpgradeInvoice,
  readGrantedSubscriptionAmount,
  resolveSubscriptionUpgrade,
} from "@/features/subscription/lib/subscription-upgrade-grant";

function price(plan: string, interval: "month" | "year"): Stripe.Price {
  return {
    id: `price_${plan}_${interval}`,
    lookup_key: `persta_subscription_${plan}_${interval === "month" ? "monthly" : "yearly"}`,
    recurring: { interval },
  } as unknown as Stripe.Price;
}

function subscription(plan: string, interval: "month" | "year"): Stripe.Subscription {
  return { items: { data: [{ price: price(plan, interval) }] } } as unknown as Stripe.Subscription;
}

function previous(plan: string, interval: "month" | "year") {
  return { items: { data: [{ price: price(plan, interval) }] } };
}

describe("resolveSubscriptionUpgrade", () => {
  it.each([
    ["ライト→スタンダード(月額)", "light", "standard", "month", 700],
    ["スタンダード→プレミアム(月額)", "standard", "premium", "month", 1500],
    ["ライト→プレミアム(年額どうし)", "light", "premium", "year", 2200],
  ])("%s は差 %p ペルコイン", (_label, from, to, interval, amount) => {
    expect(
      resolveSubscriptionUpgrade({
        previousAttributes: previous(from, interval as "month" | "year"),
        subscription: subscription(to, interval as "month" | "year"),
      }),
    ).toEqual({ previousPlan: from, currentPlan: to, billingInterval: interval, grantAmount: amount });
  });

  it.each([
    ["プランを下げた", previous("premium", "month"), subscription("light", "month")],
    ["月額→年額(予約の変更)", previous("light", "month"), subscription("light", "year")],
    ["プランも期間も変えた", previous("light", "month"), subscription("premium", "year")],
    ["価格が変わっていない(ほかの項目の変更)", { cancel_at_period_end: true }, subscription("standard", "month")],
    ["変わる前の値が無い", undefined, subscription("standard", "month")],
    ["前の価格が ID だけ", { items: { data: [{ price: "price_x" }] } }, subscription("standard", "month")],
    [
      "前の価格がペルスタのプランでない",
      { items: { data: [{ price: { id: "price_other", lookup_key: "other", recurring: { interval: "month" } } }] } },
      subscription("standard", "month"),
    ],
  ])("%s ときは付けない", (_label, previousAttributes, sub) => {
    expect(resolveSubscriptionUpgrade({ previousAttributes, subscription: sub })).toBeNull();
  });
});

describe("isSettledUpgradeInvoice", () => {
  const paid = { id: "in_1", status: "paid", billing_reason: "subscription_update" } as Stripe.Invoice;

  it("プラン変更の請求が支払い済みなら付ける", () => {
    expect(isSettledUpgradeInvoice(paid)).toBe(true);
  });

  it.each([
    ["支払い前", { ...paid, status: "open" }],
    ["毎月の更新の請求(古い請求の ID で付けない)", { ...paid, billing_reason: "subscription_cycle" }],
    ["ID だけ(展開されていない)", "in_1"],
    ["請求が無い", null],
  ])("%s なら付けない", (_label, invoice) => {
    expect(isSettledUpgradeInvoice(invoice as Stripe.Invoice | string | null)).toBe(false);
  });
});

describe("grantSubscriptionUpgradeDifference", () => {
  const upgrade = { previousPlan: "light", currentPlan: "standard", billingInterval: "month", grantAmount: 700 } as const;
  const invoice = { id: "in_1", livemode: true } as Stripe.Invoice;

  function client(result: { data: unknown; error: { message: string } | null }) {
    const rpc = jest.fn(async () => result);
    return { supabase: { rpc } as unknown as SupabaseClient, rpc };
  }

  it("同じ請求 ID で差を付けにいき、売上は載せない", async () => {
    const { supabase, rpc } = client({ data: 700, error: null });

    await expect(grantSubscriptionUpgradeDifference(supabase, { userId: "u1", upgrade, invoice })).resolves.toBe(700);

    expect(rpc).toHaveBeenCalledWith("grant_subscription_percoins", {
      p_user_id: "u1",
      p_amount: 700,
      p_invoice_id: "in_1",
      p_metadata: {
        plan: "standard",
        previousPlan: "light",
        billingInterval: "month",
        grantSource: "stripe_subscription_upgrade_webhook",
        mode: "live",
      },
    });
    const metadata = (rpc.mock.calls[0] as unknown[])[1] as { p_metadata: Record<string, unknown> };
    expect(metadata.p_metadata).not.toHaveProperty("revenueYen");
  });

  it("すでに付いていれば(RPC が0)、0を返す", async () => {
    const { supabase } = client({ data: 0, error: null });

    await expect(grantSubscriptionUpgradeDifference(supabase, { userId: "u1", upgrade, invoice })).resolves.toBe(0);
  });

  it("付与に失敗したら投げる(Stripe に送り直させる)", async () => {
    const { supabase } = client({ data: null, error: { message: "db down" } });

    await expect(grantSubscriptionUpgradeDifference(supabase, { userId: "u1", upgrade, invoice })).rejects.toThrow(
      "db down",
    );
  });
});

describe("readGrantedSubscriptionAmount", () => {
  function client(row: { amount: number } | null) {
    const calls: Array<[string, unknown]> = [];
    interface Builder {
      select: () => Builder;
      eq: (column: string, value: unknown) => Builder;
      maybeSingle: () => Promise<{ data: { amount: number } | null; error: null }>;
    }
    const builder: Builder = {
      select: () => builder,
      eq: (column, value) => {
        calls.push([column, value]);
        return builder;
      },
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return { supabase: { from: jest.fn(() => builder) } as unknown as SupabaseClient, calls };
  }

  it("その人・その請求のサブスクの付与の量を返す(通知の側が先に付けていたとき)", async () => {
    const { supabase, calls } = client({ amount: 700 });

    await expect(readGrantedSubscriptionAmount(supabase, { userId: "u1", invoiceId: "in_1" })).resolves.toBe(700);
    expect(calls).toEqual([
      ["user_id", "u1"],
      ["transaction_type", "subscription"],
      ["stripe_payment_intent_id", "in_1"],
    ]);
  });

  it("無ければ0(上限で付かなかったときなど)", async () => {
    const { supabase } = client(null);

    await expect(readGrantedSubscriptionAmount(supabase, { userId: "u1", invoiceId: "in_1" })).resolves.toBe(0);
  });
});
