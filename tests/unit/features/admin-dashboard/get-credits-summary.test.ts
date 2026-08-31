/** @jest-environment node */

/**
 * ペルコイン残高内訳が、1,000行を超える取引でも全件集計されること。
 *
 * 元の実装は credit_transactions を期間フィルタ無しで取り、PostgREST の
 * 1,000行上限に当たっていた。全 9,154行(2026-08-31)に対し約11%しか
 * 集計できておらず、付与額・購入額・消費額がすべて過小だった。
 * 同じ集計が page.tsx と route.ts に2本あったため、ここに寄せている。
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { getCreditsSummary } from "@/features/admin-dashboard/lib/get-credits-summary";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

type Row = Record<string, unknown>;

/** id 昇順のカーソル(`gt`)と `limit` を解釈する簡易テーブル。 */
function tableFrom(rows: Row[], failing = false) {
  let cursor: string | null = null;
  let pageSize = rows.length;

  const chain: Record<string, unknown> = {};
  const passthrough = ["select", "order", "in", "eq"];
  for (const method of passthrough) {
    chain[method] = () => chain;
  }
  chain.gt = (_column: string, value: string) => {
    cursor = value;
    return chain;
  };
  chain.limit = (count: number) => {
    pageSize = count;
    return chain;
  };
  chain.then = (resolve: (value: unknown) => unknown) => {
    if (failing) {
      return resolve({ data: null, error: { message: "boom" } });
    }
    const start = cursor
      ? rows.findIndex((row) => (row.id as string) > (cursor as string))
      : 0;
    const slice = start === -1 ? [] : rows.slice(start, start + pageSize);
    return resolve({ data: slice, error: null });
  };
  return chain;
}

function mockTables(options: {
  credits: Row[];
  transactions: Row[];
  failing?: "user_credits" | "credit_transactions";
}) {
  mockCreateAdminClient.mockReturnValue({
    from: (table: string) => {
      if (table === "user_credits") {
        return tableFrom(options.credits, options.failing === "user_credits");
      }
      if (table === "credit_transactions") {
        return tableFrom(
          options.transactions,
          options.failing === "credit_transactions"
        );
      }
      return tableFrom([]); // profiles
    },
  } as never);
}

const USER = "11111111-1111-1111-1111-111111111111";

describe("getCreditsSummary", () => {
  beforeEach(() => jest.clearAllMocks());

  test("1,000件を超える取引でも全件を積み上げる", async () => {
    // 上限ちょうどで切れると 1,000 になる。2,500件全部を数えられること
    const transactions = Array.from({ length: 2500 }, (_, i) => ({
      id: String(i).padStart(6, "0"),
      user_id: USER,
      amount: 1,
      transaction_type: "daily_post",
      metadata: null,
    }));

    mockTables({
      credits: [
        { id: "c1", user_id: USER, balance: 2500, paid_balance: 0 },
      ],
      transactions,
    });

    const { totals } = await getCreditsSummary();

    expect(totals.promo_granted).toBe(2500);
  });

  test("購入・付与・消費を種別ごとに振り分ける", async () => {
    mockTables({
      credits: [{ id: "c1", user_id: USER, balance: 30, paid_balance: 10 }],
      transactions: [
        { id: "t1", user_id: USER, amount: 100, transaction_type: "purchase", metadata: null },
        { id: "t2", user_id: USER, amount: 20, transaction_type: "streak", metadata: null },
        { id: "t3", user_id: USER, amount: 5, transaction_type: "refund", metadata: null },
        {
          id: "t4",
          user_id: USER,
          amount: -10,
          transaction_type: "consumption",
          metadata: { from_paid: 4, from_promo: 6 },
        },
      ],
    });

    const { totals, items } = await getCreditsSummary();

    expect(totals.paid_purchased).toBe(100);
    // streak 20 + refund 5
    expect(totals.promo_granted).toBe(25);
    expect(totals.paid_consumed).toBe(4);
    expect(totals.promo_consumed).toBe(6);
    expect(totals.consumption_unknown).toBe(0);
    expect(items[0]?.promo_balance).toBe(20);
  });

  test("内訳が不明な消費は unknown に積む", async () => {
    mockTables({
      credits: [{ id: "c1", user_id: USER, balance: 0, paid_balance: 0 }],
      transactions: [
        {
          id: "t1",
          user_id: USER,
          amount: -10,
          transaction_type: "consumption",
          metadata: null,
        },
      ],
    });

    const { totals } = await getCreditsSummary();

    expect(totals.consumption_unknown).toBe(10);
  });

  test("取引の取得に失敗したら 0 の表を返さず throw する", async () => {
    mockTables({
      credits: [{ id: "c1", user_id: USER, balance: 10, paid_balance: 0 }],
      transactions: [],
      failing: "credit_transactions",
    });

    // 0 は「0だった」という嘘の数字として読めるので、静かに続行しない
    await expect(getCreditsSummary()).rejects.toThrow(
      "取引履歴の取得に失敗しました"
    );
  });

  test("残高の取得に失敗したら throw する", async () => {
    mockTables({
      credits: [],
      transactions: [],
      failing: "user_credits",
    });

    await expect(getCreditsSummary()).rejects.toThrow(
      "残高の取得に失敗しました"
    );
  });
});
