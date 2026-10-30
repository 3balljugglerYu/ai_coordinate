/**
 * プランを上げたときの差のペルコインを、その請求が払われたときの通知(invoice.paid)の側でも付ける(保険)。
 *
 * ここで守ること:
 *  - 前と後のプランは、その請求の明細で決める(日割りでマイナスの行=前の価格・日割りでないプラスの行=新しい期間の代金)
 *  - 付けるのは、同じ期間(月額どうし・年額どうし)でプランを上げたときだけ。量は change-service.ts と同じ
 *    (新しいプランの月の量 − 前のプランの月の量)
 *  - 新しい期間の代金が無い請求(期間を区切り直さずに上げた)は付けない(わずかな日割りで差がまるごと付くのを防ぐ)
 *  - 下げた・期間を変えた・ペルスタのプランでない価格は付けない
 *  - 明細の価格が ID だけなら読んで決める
 *  - 付与の RPC に同じ請求 ID で渡す(すでに付いていれば RPC が0を返し、二重には付かない)
 *  - 売上は載せない(支払いの行で数える)・付与に失敗したら投げる(Stripe に送り直させる)
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findUpgradeLinePrices,
  grantSubscriptionUpgradeDifference,
  readGrantedSubscriptionAmount,
  resolveUpgradeFromInvoice,
} from "@/features/subscription/lib/subscription-upgrade-grant";

function price(plan: string, interval: "month" | "year"): Stripe.Price {
  return {
    id: `price_${plan}_${interval}`,
    lookup_key: `persta_subscription_${plan}_${interval === "month" ? "monthly" : "yearly"}`,
    recurring: { interval },
  } as unknown as Stripe.Price;
}

function line(amount: number, proration: boolean, linePrice: Stripe.Price | string) {
  return {
    amount,
    parent: { type: "subscription_item_details", subscription_item_details: { proration } },
    pricing: { type: "price_details", price_details: { price: linePrice } },
  };
}

function invoice(lines: Array<Record<string, unknown>>): Stripe.Invoice {
  return { id: "in_1", livemode: true, lines: { data: lines } } as unknown as Stripe.Invoice;
}

/** アプリと同じ上げ方(今日から新しい期間): 前のプランの残りの返金 + 新しいプランの代金 */
function upgradeInvoice(from: string, to: string, interval: "month" | "year") {
  return invoice([line(-200, true, price(from, interval)), line(980, false, price(to, interval))]);
}

const noLoad = async () => null;

afterEach(() => {
  jest.restoreAllMocks();
});

describe("resolveUpgradeFromInvoice", () => {
  it.each([
    ["ライト→スタンダード(月額)", "light", "standard", "month", 700],
    ["スタンダード→プレミアム(月額)", "standard", "premium", "month", 1500],
    ["ライト→プレミアム(年額どうし)", "light", "premium", "year", 2200],
  ])("%s は差 %p ペルコイン", async (_label, from, to, interval, amount) => {
    await expect(
      resolveUpgradeFromInvoice(upgradeInvoice(from, to, interval as "month" | "year"), noLoad),
    ).resolves.toEqual({ previousPlan: from, currentPlan: to, billingInterval: interval, grantAmount: amount });
  });

  it("明細の価格が ID だけなら読んで決める", async () => {
    const prices: Record<string, Stripe.Price> = {
      price_light_month: price("light", "month"),
      price_standard_month: price("standard", "month"),
    };
    const loadPrice = jest.fn(async (id: string) => prices[id] ?? null);

    await expect(
      resolveUpgradeFromInvoice(
        invoice([line(-200, true, "price_light_month"), line(980, false, "price_standard_month")]),
        loadPrice,
      ),
    ).resolves.toMatchObject({ previousPlan: "light", currentPlan: "standard", grantAmount: 700 });
    expect(loadPrice).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["プランを下げた", upgradeInvoice("premium", "light", "month")],
    ["期間が違う(月額→年額)", invoice([line(-200, true, price("light", "month")), line(9800, false, price("light", "year"))])],
    [
      "新しい期間の代金が無い(期間を区切り直さずに上げた)",
      invoice([line(-200, true, price("light", "month")), line(300, true, price("premium", "month"))]),
    ],
    ["前のプランの返金の行が無い", invoice([line(980, false, price("standard", "month"))])],
    [
      "ペルスタのプランでない価格",
      invoice([
        line(-200, true, { id: "price_other", lookup_key: "other", recurring: { interval: "month" } } as unknown as Stripe.Price),
        line(980, false, price("standard", "month")),
      ]),
    ],
    ["明細が無い", invoice([])],
  ])("%s ときは付けない", async (_label, inv) => {
    await expect(resolveUpgradeFromInvoice(inv, noLoad)).resolves.toBeNull();
  });
});

describe("findUpgradeLinePrices", () => {
  it("古い形の通知(line.price と line.proration)でも見つける", () => {
    const legacy = invoice([
      { amount: -200, proration: true, price: price("light", "month") },
      { amount: 980, proration: false, price: price("standard", "month") },
    ]);
    expect(findUpgradeLinePrices(legacy)).toEqual({
      previous: price("light", "month"),
      current: price("standard", "month"),
    });
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
        grantSource: "stripe_invoice_paid_upgrade",
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

  it("読めなかったらログに残して0を返す(プラン変更そのものは失敗にしない)", async () => {
    interface Builder {
      select: () => Builder;
      eq: () => Builder;
      maybeSingle: () => Promise<{ data: null; error: { message: string } }>;
    }
    const builder: Builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: null, error: { message: "db down" } }),
    };
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      readGrantedSubscriptionAmount({ from: () => builder } as unknown as SupabaseClient, {
        userId: "u1",
        invoiceId: "in_1",
      }),
    ).resolves.toBe(0);
    expect(errors).toHaveBeenCalled();
  });
});

describe("findUpgradeLinePrices(前のプランの返金の行が混ざるとき)", () => {
  it("返金の行が同じ価格で2行あっても、その価格を前のプランとする", () => {
    const light = price("light", "month");
    const standard = price("standard", "month");
    expect(
      findUpgradeLinePrices(invoice([line(-100, true, light), line(-50, true, light), line(980, false, standard)])),
    ).toEqual({ previous: light, current: standard });
  });

  it("前からの日割りが混ざり、返金の価格が2種類あると、どれを置き換えたか決められないので付けない", async () => {
    const warns = jest.spyOn(console, "warn").mockImplementation(() => {});
    // ライト→スタンダード(未請求のまま)のあとに、スタンダード→プレミアム
    const mixed = invoice([
      line(-300, true, price("light", "month")),
      line(400, true, price("standard", "month")),
      line(-200, true, price("standard", "month")),
      line(2980, false, price("premium", "month")),
    ]);

    expect(findUpgradeLinePrices(mixed)).toBeNull();
    await expect(resolveUpgradeFromInvoice(mixed, noLoad)).resolves.toBeNull();
    expect(warns).toHaveBeenCalled();
  });
});
