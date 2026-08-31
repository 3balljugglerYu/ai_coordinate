/** @jest-environment node */

/**
 * 土台になる取得が失敗したとき、空配列に潰して「0件」を描画しないこと。
 *
 * fetchAllRows は上限到達や途中失敗で error を返す。これを `?? []` に
 * 落とすと、0件が正常な集計結果として画面に出てしまう。silent undercount を
 * 止めるために入れたエラー経路が、別の形の silent wrong number に化ける。
 * (PR #579 レビュー指摘)
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

/** 指定テーブルだけ error を返し、他は空データを返すクライアント。 */
function mockClientFailing(failingTable: string | null) {
  const builder = (table: string) => {
    const result =
      table === failingTable
        ? { data: null, error: { message: "boom" }, count: 0 }
        : { data: [], error: null, count: 0 };

    const chain: Record<string, unknown> = {};
    for (const method of [
      "select",
      "gte",
      "lte",
      "gt",
      "eq",
      "neq",
      "not",
      "in",
      "order",
      "limit",
    ]) {
      chain[method] = () => chain;
    }
    // await されたら結果を返す
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return chain;
  };

  mockCreateAdminClient.mockReturnValue({
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as never);
}

describe("getAdminDashboardData の土台データ取得が失敗したとき", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    "generated_images",
    "style_usage_events",
    "credit_transactions",
    "image_jobs",
  ])("%s が失敗したら throw する（0件として描画しない）", async (table) => {
    mockClientFailing(table);

    await expect(getAdminDashboardData("30d")).rejects.toThrow(
      new RegExp(`${table} の取得に失敗しました`)
    );
  });

  test("どれも失敗しなければ throw しない", async () => {
    mockClientFailing(null);

    await expect(getAdminDashboardData("30d")).resolves.toBeDefined();
  });
});
