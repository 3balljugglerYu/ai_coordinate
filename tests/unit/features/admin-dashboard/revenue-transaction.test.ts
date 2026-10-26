/**
 * 売上に数える支払い(isRevenueTransaction)。
 *
 * 今のダッシュボードと概要の両方が使う。get-admin-dashboard-data の中にあった決まりを
 * 切り出したもので、挙動は変えていない(本番だけ・purchase はすべて・subscription は金額が決まるもの)。
 */

import { isRevenueTransaction } from "@/features/admin-dashboard/lib/revenue-transaction";

const tx = (transaction_type: string, metadata: Record<string, unknown> | null, amount = 300) => ({
  transaction_type,
  metadata,
  amount,
});

describe("isRevenueTransaction", () => {
  test("本番の purchase は数える", () => {
    expect(isRevenueTransaction(tx("purchase", { mode: "live", revenueYen: 500 }))).toBe(true);
  });

  test.each([
    ["テストの支払い", { mode: "test", revenueYen: 500 }],
    ["見本の支払い", { mode: "mock" }],
    ["mode が無い", { revenueYen: 500 }],
    ["metadata が null", null],
  ])("%s の purchase は数えない", (_label, metadata) => {
    expect(isRevenueTransaction(tx("purchase", metadata))).toBe(false);
  });

  test("金額の決まる本番のサブスクは数え、決まらないものは数えない", () => {
    expect(
      isRevenueTransaction(
        tx("subscription", { mode: "live", plan: "light", billingInterval: "month", revenueYen: 980 }),
      ),
    ).toBe(true);
    expect(isRevenueTransaction(tx("subscription", { mode: "live" }))).toBe(false);
  });

  test("支払い以外の種類は数えない", () => {
    expect(isRevenueTransaction(tx("streak", { mode: "live" }))).toBe(false);
  });
});
