/**
 * 取り込んだ広告の行を、画面の「広告ごと」と「内訳」にまとめる。
 *
 * ここで守ること:
 *  - 広告ごとの合計は、日ごとに内訳なしの行を使い、無い日は内訳を1種類だけ足す（二重に数えない）
 *  - X の「書き出し全体」の行は広告の一覧に出さず、内訳にだけ出す
 *  - 目印が無い広告の登録は「—」（null）、目印があって0人なら 0
 *  - 内訳の割合は、その内訳の中の使った額の割合
 */

import {
  summarizeAdStats,
  type AdFunnel,
} from "@/features/admin-dashboard/lib/ad-stats/summarize-ad-stats";
import type { AdStatRow } from "@/features/admin-dashboard/lib/ad-stats/ad-stats-types";

function row(overrides: Partial<AdStatRow>): AdStatRow {
  return {
    platform: "meta",
    statDate: "2026-10-27",
    adKey: "name:A",
    adName: "A",
    breakdownType: "none",
    breakdownValue: "",
    spendJpy: 0,
    impressions: 0,
    reach: null,
    linkClicks: 0,
    landingPageViews: 0,
    videoViews: null,
    ...overrides,
  };
}

describe("summarizeAdStats", () => {
  it("年齢別と配置別の両方を取り込んでも、合計は年齢の行だけで作る", () => {
    const rows = [
      row({ breakdownType: "age", breakdownValue: "25-34", spendJpy: 100, impressions: 10, linkClicks: 2 }),
      row({ breakdownType: "age", breakdownValue: "35-44", spendJpy: 50, impressions: 5, linkClicks: 1 }),
      row({ breakdownType: "placement", breakdownValue: "Instagram / フィード", spendJpy: 150, impressions: 15, linkClicks: 3 }),
    ];

    const summary = summarizeAdStats(rows, [], new Map());

    expect(summary.ads).toHaveLength(1);
    expect(summary.ads[0]).toMatchObject({ spendJpy: 150, impressions: 15, linkClicks: 3 });
    expect(summary.totals).toEqual([
      expect.objectContaining({ platform: "meta", spendJpy: 150, impressions: 15 }),
    ]);
  });

  it("内訳なしの行がある日はそれを使い、無い日だけ内訳から作る", () => {
    const rows = [
      row({ statDate: "2026-10-27", spendJpy: 70, impressions: 7 }),
      row({ statDate: "2026-10-27", breakdownType: "age", breakdownValue: "25-34", spendJpy: 70, impressions: 7 }),
      row({ statDate: "2026-10-28", breakdownType: "age", breakdownValue: "25-34", spendJpy: 30, impressions: 3 }),
    ];

    const [ad] = summarizeAdStats(rows, [], new Map()).ads;

    expect(ad).toMatchObject({
      spendJpy: 100,
      impressions: 10,
      firstDate: "2026-10-27",
      lastDate: "2026-10-28",
    });
  });

  it("X の書き出し全体の行は、広告の一覧に出さず内訳にだけ出す", () => {
    const rows = [
      row({ platform: "x", adKey: "111", adName: "90作品", spendJpy: 40, impressions: 4, landingPageViews: null }),
      row({ platform: "x", adKey: "all:111", adName: "この書き出しの広告すべて（90作品）", breakdownType: "age", breakdownValue: "25-34", spendJpy: 30, impressions: 3 }),
      row({ platform: "x", adKey: "all:111", adName: "この書き出しの広告すべて（90作品）", breakdownType: "age", breakdownValue: "45-54", spendJpy: 10, impressions: 1 }),
    ];

    const summary = summarizeAdStats(rows, [], new Map());

    expect(summary.ads.map((ad) => ad.adKey)).toEqual(["111"]);
    expect(summary.groups).toEqual([
      expect.objectContaining({
        adKey: "all:111",
        breakdowns: [
          {
            type: "age",
            items: [
              expect.objectContaining({ value: "25-34", spendJpy: 30, spendShare: 0.75 }),
              expect.objectContaining({ value: "45-54", spendJpy: 10, spendShare: 0.25 }),
            ],
          },
        ],
      }),
    ]);
  });

  it("目印が無い広告の登録は null、目印があって登録が無ければ 0人", () => {
    const rows = [
      row({ adKey: "name:A", adName: "A", spendJpy: 10, impressions: 1 }),
      row({ adKey: "name:B", adName: "B", spendJpy: 10, impressions: 1 }),
      row({ adKey: "name:C", adName: "C", spendJpy: 10, impressions: 1 }),
    ];
    const funnel = new Map<string, AdFunnel>([["tag_b", { signups: 2, generated: 1, posted: 0 }]]);

    const summary = summarizeAdStats(
      rows,
      [
        { platform: "meta", adKey: "name:B", signupSource: "tag_b" },
        { platform: "meta", adKey: "name:C", signupSource: "tag_c" },
      ],
      funnel,
    );
    const byKey = Object.fromEntries(summary.ads.map((ad) => [ad.adKey, ad]));

    expect(byKey["name:A"]).toMatchObject({ signupSource: null, funnel: null });
    expect(byKey["name:B"]).toMatchObject({ signupSource: "tag_b", funnel: { signups: 2, generated: 1, posted: 0 } });
    expect(byKey["name:C"]).toMatchObject({ signupSource: "tag_c", funnel: { signups: 0, generated: 0, posted: 0 } });
  });

  it("列が無い数字（X のページを開いた数）は合計でも null のまま", () => {
    const rows = [
      row({ platform: "x", adKey: "111", landingPageViews: null, spendJpy: 1, impressions: 1 }),
      row({ platform: "x", adKey: "111", statDate: "2026-10-28", landingPageViews: null, spendJpy: 1, impressions: 1 }),
    ];

    const summary = summarizeAdStats(rows, [], new Map());

    expect(summary.ads[0].landingPageViews).toBeNull();
    expect(summary.totals[0].landingPageViews).toBeNull();
  });
});
