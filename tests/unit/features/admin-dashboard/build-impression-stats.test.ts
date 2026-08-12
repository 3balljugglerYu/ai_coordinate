/**
 * インプレッション集計RPCの戻り値を整形する純ロジックのテスト。
 *
 * ここが誤ると admin の数字が黙って狂う。特に「期間のユニーク視聴者数」を
 * 日次の合計と取り違えると、同じ人が複数日見ただけで人数が水増しされる。
 * SQL 側で totals を別に出しているのはそのためで、ここでは totals を
 * 日次から作り直さないことを固定する。
 */

import {
  formatImpressionDateLabel,
  parseImpressionStats,
} from "@/features/admin-dashboard/lib/build-impression-stats";

const RAW = {
  daily: [
    {
      date: "2026-08-11",
      impressions: 100,
      unique_viewers: 20,
      unique_posts: 40,
      grid: 60,
      feed: 30,
      detail: 10,
      unknown: 0,
      authenticated: 70,
      guest: 30,
    },
    {
      date: "2026-08-12",
      impressions: 50,
      unique_viewers: 15,
      unique_posts: 25,
      grid: 20,
      feed: 20,
      detail: 10,
      unknown: 0,
      authenticated: 40,
      guest: 10,
    },
  ],
  totals: {
    impressions: 150,
    // 2日間の実人数。日次の合計(35)ではない
    unique_viewers: 24,
    unique_posts: 50,
    grid: 80,
    feed: 50,
    detail: 20,
    unknown: 0,
    authenticated: 110,
    guest: 40,
  },
  topPosts: [
    { image_id: "img-1", impressions: 30, unique_viewers: 18 },
    { image_id: "img-2", impressions: 12, unique_viewers: 9 },
  ],
};

describe("parseImpressionStats", () => {
  test("日次・合計・上位投稿をそのまま取り出す", () => {
    const result = parseImpressionStats(RAW);

    expect(result.daily).toHaveLength(2);
    expect(result.daily[0]).toMatchObject({
      date: "2026-08-11",
      label: "8/11",
      impressions: 100,
      uniqueViewers: 20,
      grid: 60,
      feed: 30,
      detail: 10,
      authenticated: 70,
      guest: 30,
    });

    // 日次の合計(20+15=35)で上書きしない
    expect(result.totals.uniqueViewers).toBe(24);
    expect(result.totals.impressions).toBe(150);

    expect(result.topPostRefs).toEqual([
      { imageId: "img-1", impressions: 30, uniqueViewers: 18 },
      { imageId: "img-2", impressions: 12, uniqueViewers: 9 },
    ]);
  });

  test("1投稿あたり平均は小数第1位まで、投稿0件なら0(0除算にしない)", () => {
    expect(parseImpressionStats(RAW).totals.averagePerPost).toBe(3);

    const empty = parseImpressionStats({
      daily: [],
      totals: { impressions: 10, unique_posts: 0 },
      topPosts: [],
    });
    expect(empty.totals.averagePerPost).toBe(0);

    const rounded = parseImpressionStats({
      daily: [],
      totals: { impressions: 10, unique_posts: 3 },
      topPosts: [],
    });
    expect(rounded.totals.averagePerPost).toBe(3.3);
  });

  test("null/壊れた形でも落ちず空を返す(admin を真っ白にしない)", () => {
    for (const raw of [null, undefined, "oops", 42, {}]) {
      const result = parseImpressionStats(raw);
      expect(result.daily).toEqual([]);
      expect(result.topPostRefs).toEqual([]);
      expect(result.totals.impressions).toBe(0);
    }
  });

  test("date や image_id を欠く行は落とす", () => {
    const result = parseImpressionStats({
      daily: [{ impressions: 5 }, { date: "2026-08-12", impressions: 5 }],
      totals: {},
      topPosts: [{ impressions: 3 }, { image_id: "img-9", impressions: 3 }],
    });

    expect(result.daily.map((d) => d.date)).toEqual(["2026-08-12"]);
    expect(result.topPostRefs.map((t) => t.imageId)).toEqual(["img-9"]);
  });

  test("負数・非数値は0として扱う", () => {
    const result = parseImpressionStats({
      daily: [
        { date: "2026-08-12", impressions: -5, unique_viewers: "many", grid: null },
      ],
      totals: {},
      topPosts: [],
    });

    expect(result.daily[0]).toMatchObject({
      impressions: 0,
      uniqueViewers: 0,
      grid: 0,
    });
  });
});

describe("formatImpressionDateLabel", () => {
  test("YYYY-MM-DD を M/D にする(ゼロ埋めを外す)", () => {
    expect(formatImpressionDateLabel("2026-08-12")).toBe("8/12");
    expect(formatImpressionDateLabel("2026-01-05")).toBe("1/5");
  });

  test("想定外の形式はそのまま返す", () => {
    expect(formatImpressionDateLabel("2026/08/12")).toBe("2026/08/12");
  });
});
