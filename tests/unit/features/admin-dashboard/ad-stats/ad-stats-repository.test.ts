/** @jest-environment node */

/**
 * 「広告の成果」の画面に渡すものを読む（getAdStatsOverview）。
 *
 * ここで守ること:
 *  - 日ごとの登録（profiles）が読めなくても、画面全体は出す（登録のグラフだけ外す）
 *  - 日ごとの登録は、グラフの期間（日本時間）の中だけを読む
 *  - 日ごとの合計の元（daily）は画面へ渡さない（dailyChart に入れてある）
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/features/admin-dashboard/lib/get-operator-user-ids", () => ({
  getOperatorUserIds: jest.fn(async () => ["operator"]),
}));
jest.mock("@/features/admin-dashboard/lib/timeline-event-repository", () => ({
  listTimelineEvents: jest.fn(async () => [
    { eventDate: "2026-10-26", title: "広告を出し直し", kind: "ad" },
  ]),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdStatsOverview } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";

type Result = { data: unknown; error: { message: string } | null };

/** fetchAllById が呼ぶ形（select → 絞り込み → gt? → order → limit）のスタブ。呼ばれた絞り込みを記録する */
function table(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, jest.Mock> = {};
  for (const method of ["select", "in", "gte", "lt", "gt", "order", "eq"]) {
    builder[method] = jest.fn((...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    });
  }
  builder.limit = jest.fn(async () => result);
  return { builder, calls };
}

function statRow(overrides: Record<string, unknown>) {
  return {
    id: `s-${Math.random()}`,
    platform: "x",
    stat_date: "2026-10-27",
    ad_key: "111",
    ad_name: "変身",
    breakdown_type: "none",
    breakdown_value: "",
    spend_jpy: "1000",
    impressions: "5000",
    link_clicks: "40",
    landing_page_views: null,
    video_views: null,
    ...overrides,
  };
}

function setup(profiles: Result) {
  const tables = {
    ad_platform_daily_stats: table({
      data: [statRow({ stat_date: "2026-10-26" }), statRow({ stat_date: "2026-10-29" })],
      error: null,
    }),
    ad_platform_ads: table({
      data: [{ id: "a1", platform: "x", ad_key: "111", ad_name: "変身", signup_source: "tag_x" }],
      error: null,
    }),
    profiles: table(profiles),
  };
  const rpc = jest.fn(async (name: string) =>
    name === "get_ad_signup_funnel"
      ? { data: [{ signup_source: "tag_x", signups: 2, generated: 1, posted: 0 }], error: null }
      : { data: [], error: null },
  );
  const client = {
    from: jest.fn((name: keyof typeof tables) => tables[name].builder),
    rpc,
  } as unknown as SupabaseClient;
  return { client, tables };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-10-30T03:00:00Z") });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

describe("getAdStatsOverview", () => {
  it("日ごとの登録を読めなくても、道のりと表は出し、登録のグラフだけ外す", async () => {
    const { client } = setup({ data: null, error: { message: "timeout" } });

    const overview = await getAdStatsOverview(client);

    expect(overview.ads).toHaveLength(1);
    expect(overview.funnels[0].steps.find((step) => step.key === "signups")?.value).toBe(2);
    expect(overview.dailyChart).toMatchObject({ signupsAvailable: false, endsToday: true });
    expect(overview.dailyChart?.rows.every((row) => row.xSignups === 0)).toBe(true);
  });

  it("日ごとの登録は、グラフの期間（日本時間の最初の日 0:00 〜 最後の日の翌日 0:00）だけを読み、運営を除く", async () => {
    const { client, tables } = setup({
      data: [
        { id: "p1", user_id: "u1", signup_source: "tag_x", created_at: "2026-10-27T03:00:00Z" },
        { id: "p2", user_id: "operator", signup_source: "tag_x", created_at: "2026-10-27T04:00:00Z" },
      ],
      error: null,
    });

    const overview = await getAdStatsOverview(client);

    // 広告は 10/26〜10/29、7日後は 11/05 だが今日（10/30）で止める
    expect(tables.profiles.calls).toEqual(
      expect.arrayContaining([
        ["in", ["signup_source", ["tag_x"]]],
        ["gte", ["created_at", "2026-10-25T15:00:00.000Z"]],
        ["lt", ["created_at", "2026-10-30T15:00:00.000Z"]],
      ]),
    );
    expect(overview.dailyChart?.signupsAvailable).toBe(true);
    expect(overview.dailyChart?.rows.find((row) => row.day === "2026-10-27")?.xSignups).toBe(1);
    expect(overview.dailyChart?.events).toEqual([{ eventDate: "2026-10-26", title: "広告を出し直し" }]);
    expect(overview).not.toHaveProperty("daily");
  });
});
