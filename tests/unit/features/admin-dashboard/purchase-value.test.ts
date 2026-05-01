import { resolveTransactionRevenue } from "@/features/admin-dashboard/lib/purchase-value";

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
          invoice_id: "yearly-monthly:sub_123:20260501000000",
        },
      })
    ).toEqual({
      key: "subscription",
      label: "サブスクリプション",
      yenValue: null,
    });
  });
});
