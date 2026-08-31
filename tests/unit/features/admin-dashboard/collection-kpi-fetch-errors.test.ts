/** @jest-environment node */

/**
 * 企画 KPI の取得が失敗したとき、0件として集計しないこと。
 *
 * fetchAllById は上限到達や途中失敗で error を返す。これを `?? []` に
 * 落とすと「0件だった」という正常な KPI として画面に出て、企画の評価を
 * 誤らせる。#579 と同じ型の事故なので、ここでも throw を固定する。
 * (PR #580 レビュー指摘)
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import {
  getCollectionKpi,
  getCollectionUuFunnel,
} from "@/features/admin-dashboard/lib/get-collection-kpi";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

const PRESET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/**
 * @param failingTable エラーを返すテーブル。null なら全部成功
 */
function mockClient(failingTable: string | null) {
  mockCreateAdminClient.mockReturnValue({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "neq",
        "in",
        "gt",
        "gte",
        "lte",
        "order",
        "limit",
      ]) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => unknown) => {
        if (table === failingTable) {
          return resolve({ data: null, error: { message: "boom" } });
        }
        // style_presets は presetIds を作るための先行クエリ
        if (table === "style_presets") {
          return resolve({
            data: [{ id: PRESET_ID, display_order: 1, title: "柱1" }],
            error: null,
          });
        }
        return resolve({ data: [], error: null });
      };
      return chain;
    },
  } as never);
}

const kpiParams = {
  categoryKey: "travel_to_australia",
  categoryId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  currentStart: new Date("2026-08-01T00:00:00Z"),
  previousStart: new Date("2026-07-01T00:00:00Z"),
  now: new Date("2026-08-31T00:00:00Z"),
  operatorUserIds: [],
};

const funnelParams = {
  categoryKey: kpiParams.categoryKey,
  categoryId: kpiParams.categoryId,
  currentStart: kpiParams.currentStart,
  now: kpiParams.now,
  operatorUserIds: [],
};

describe("企画KPIの取得が失敗したとき", () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(["collection_completions", "image_jobs", "style_usage_events"])(
    "getCollectionKpi: %s が失敗したら throw する",
    async (table) => {
      mockClient(table);

      await expect(getCollectionKpi(kpiParams)).rejects.toThrow(
        /の取得に失敗しました/
      );
    }
  );

  test.each(["style_usage_events", "collection_completions", "profiles"])(
    "getCollectionUuFunnel: %s が失敗したら throw する",
    async (table) => {
      mockClient(table);

      await expect(getCollectionUuFunnel(funnelParams)).rejects.toThrow(
        /の取得に失敗しました/
      );
    }
  );

  test("どれも失敗しなければ throw しない", async () => {
    mockClient(null);

    await expect(getCollectionKpi(kpiParams)).resolves.toBeDefined();
    await expect(getCollectionUuFunnel(funnelParams)).resolves.toBeDefined();
  });
});
