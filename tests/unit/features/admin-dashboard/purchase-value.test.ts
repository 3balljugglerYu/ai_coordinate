import {
  getPurchaseMode,
  resolveTransactionRevenue,
} from "@/features/admin-dashboard/lib/purchase-value";

describe("getPurchaseMode", () => {
  test("metadata に mode がなければ unknown を返す", () => {
    expect(getPurchaseMode({})).toBe("unknown");
  });
});

describe("resolveTransactionRevenue", () => {
  test("単発購入はパッケージ価格を売上として解決する", () => {
    expect(
      resolveTransactionRevenue({
        amount: 1000,
        transactionType: "purchase",
        metadata: { mode: "live", packageId: "credit-240" },
      })
    ).toMatchObject({
      label: "240ペルコイン",
      yenValue: 1000,
    });
  });

  test("単発購入は metadata の実決済金額を優先する", () => {
    expect(
      resolveTransactionRevenue({
        amount: 240,
        transactionType: "purchase",
        metadata: {
          mode: "live",
          packageId: "credit-240",
          revenueYen: 800,
        },
      })
    ).toMatchObject({
      label: "240ペルコイン",
      yenValue: 800,
    });
  });

  test("サブスクリプションは metadata の決済金額を売上として解決する", () => {
    expect(
      resolveTransactionRevenue({
        amount: 300,
        transactionType: "subscription",
        metadata: {
          mode: "live",
          plan: "light",
          billingInterval: "month",
          revenueYen: 980,
        },
      })
    ).toEqual({
      key: "subscription-light-month",
      label: "サブスクリプション light 月額",
      yenValue: 980,
    });
  });

  test("決済金額がないサブスクリプション付与は売上対象にしない", () => {
    expect(
      resolveTransactionRevenue({
        amount: 2500,
        transactionType: "subscription",
        metadata: {
          mode: "live",
          plan: "premium",
          billingInterval: "year",
        },
      })
    ).toEqual({
      key: "subscription-premium-year",
      label: "サブスクリプション premium 年額",
      yenValue: null,
    });
  });

  test("決済情報がないサブスクリプション付与は売上対象にしない", () => {
    expect(
      resolveTransactionRevenue({
        amount: 300,
        transactionType: "subscription",
        metadata: {
          mode: "live",
          invoice_id: "yearly-monthly:sub_123:20260501000000",
        },
      })
    ).toEqual({
      key: "subscription",
      label: "サブスクリプション",
      yenValue: null,
    });
  });

  test("未知の取引種別は売上対象にしない", () => {
    expect(
      resolveTransactionRevenue({
        amount: 100,
        transactionType: "bonus",
        metadata: { mode: "live", revenueYen: 100 },
      })
    ).toEqual({
      key: "bonus",
      label: "bonus",
      yenValue: null,
    });
  });
});
