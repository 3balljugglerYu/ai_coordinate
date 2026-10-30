/**
 * 「広告の成果」のグラフの元を作る。
 *
 * ここで守ること:
 *  - 道のりは クリック → ページを開いた → 登録 → 生成 → 投稿 の順。列が無い段（X のページを開いた）は出さない
 *  - 登録から先は目印ごとの人数なので、同じ目印の広告が何本あっても1回だけ数える
 *  - 前の段が30に届かない段は「まだ判断できません」にして、いちばん落ちた段の候補から外す
 *  - 日ごとのグラフは、広告の最初の日〜最後の日の7日後（今日まで・最長90日）。広告の無い日は0
 *  - 日ごとの登録は、目印ごとの期間・日本時間の日付・運営を除く、で数える（道のりの登録と一致させる）
 */

import {
  AD_DAILY_MAX_DAYS,
  adDailyRange,
  buildAdDailyRows,
  buildPlatformFunnels,
  filterSignupDays,
} from "@/features/admin-dashboard/lib/ad-stats/build-ad-charts";
import type {
  AdDailyTotal,
  AdSummary,
} from "@/features/admin-dashboard/lib/ad-stats/summarize-ad-stats";

function ad(overrides: Partial<AdSummary>): AdSummary {
  return {
    platform: "meta",
    adKey: "name:A",
    adName: "A",
    firstDate: "2026-10-26",
    lastDate: "2026-10-29",
    spendJpy: 0,
    impressions: 0,
    linkClicks: 0,
    landingPageViews: 0,
    videoViews: null,
    signupSource: null,
    sharesSignupSource: false,
    funnel: null,
    ...overrides,
  };
}

describe("buildPlatformFunnels", () => {
  it("Meta はクリック → ページを開いた → 登録 → 生成 → 投稿。同じ目印の2本の広告は人数を1回だけ数える", () => {
    const shared = { signups: 2, generated: 1, posted: 1 };
    const [meta] = buildPlatformFunnels([
      ad({
        adKey: "name:A",
        spendJpy: 3000,
        impressions: 10000,
        linkClicks: 600,
        landingPageViews: 500,
        signupSource: "tag_meta",
        funnel: shared,
      }),
      ad({
        adKey: "name:B",
        spendJpy: 1000,
        impressions: 5000,
        linkClicks: 400,
        landingPageViews: 300,
        signupSource: "tag_meta",
        sharesSignupSource: true,
        funnel: shared,
      }),
    ]);

    expect(meta.platform).toBe("meta");
    expect(meta.spendJpy).toBe(4000);
    expect(meta.steps.map((step) => [step.key, step.value, step.unit])).toEqual([
      ["linkClicks", 1000, "回"],
      ["landingPageViews", 800, "回"],
      ["signups", 2, "人"],
      ["generated", 1, "人"],
      ["posted", 1, "人"],
    ]);
    expect(meta.steps[1]).toMatchObject({ rateFromPrevious: 0.8, costPerUnitJpy: 5, tooFewToJudge: false });
    expect(meta.steps[0].rateFromPrevious).toBeNull();
  });

  it("いちばん落ちた段は、前の段が30以上ある段の中で割合がいちばん低い段（30未満の段は判断しない）", () => {
    const [meta] = buildPlatformFunnels([
      ad({
        spendJpy: 24088,
        linkClicks: 1011,
        landingPageViews: 887,
        signupSource: "tag_meta",
        funnel: { signups: 1, generated: 0, posted: 0 },
      }),
    ]);

    expect(meta.weakestStep).toBe("signups");
    const generated = meta.steps.find((step) => step.key === "generated")!;
    expect(generated).toMatchObject({ rateFromPrevious: 0, tooFewToJudge: true });
    // 生成の割合（0%）は低いが、前の段が1人なので候補にしない
    expect(meta.weakestStep).not.toBe("generated");
  });

  it("前の段がちょうど30なら判断する・29なら判断しない", () => {
    const funnelWith = (clicks: number) =>
      buildPlatformFunnels([
        ad({
          platform: "x",
          adKey: "1",
          linkClicks: clicks,
          landingPageViews: null,
          signupSource: "tag_x",
          funnel: { signups: 0, generated: 0, posted: 0 },
        }),
      ])[0];

    expect(funnelWith(30).steps[1]).toMatchObject({ key: "signups", tooFewToJudge: false });
    expect(funnelWith(30).weakestStep).toBe("signups");
    expect(funnelWith(29).steps[1]).toMatchObject({ key: "signups", tooFewToJudge: true });
    expect(funnelWith(29).weakestStep).toBeNull();
  });

  it("X はページを開いた数が無いので、クリックの次が登録", () => {
    const [x] = buildPlatformFunnels([
      ad({
        platform: "x",
        adKey: "1",
        spendJpy: 4853,
        linkClicks: 118,
        landingPageViews: null,
        signupSource: "tag_x",
        funnel: { signups: 1, generated: 0, posted: 0 },
      }),
    ]);

    expect(x.steps.map((step) => step.key)).toEqual(["linkClicks", "signups", "generated", "posted"]);
    expect(x.steps[1].costPerUnitJpy).toBe(4853);
  });

  it("目印のある広告が無ければ、登録から先の段は出さない（0人と区別する）", () => {
    const [meta] = buildPlatformFunnels([ad({ linkClicks: 100, landingPageViews: 80 })]);

    expect(meta.steps.map((step) => step.key)).toEqual(["linkClicks", "landingPageViews"]);
    expect(meta.sourcedAdCount).toBe(0);
  });

  it("同じ目印を Meta と X の両方で使っても、人数は1つの媒体（先に見つかった広告の媒体）にだけ数える", () => {
    const shared = { signups: 10, generated: 4, posted: 2 };
    const funnels = buildPlatformFunnels([
      ad({ platform: "meta", adKey: "name:A", linkClicks: 300, landingPageViews: 200, signupSource: "campaign", funnel: shared }),
      ad({ platform: "x", adKey: "1", linkClicks: 100, landingPageViews: null, signupSource: "campaign", funnel: shared }),
    ]);

    const signups = (platform: string) =>
      funnels.find((funnel) => funnel.platform === platform)!.steps.find((step) => step.key === "signups")?.value;
    expect(signups("meta")).toBe(10);
    expect(signups("x")).toBeUndefined();
    expect(funnels.find((funnel) => funnel.platform === "x")).toMatchObject({ adCount: 1, sourcedAdCount: 0 });
  });

  it("登録の割合と1人あたりの額は、目印のある広告だけで出す（目印のない広告のクリック・額を入れない）", () => {
    const [meta] = buildPlatformFunnels([
      ad({ adKey: "name:A", spendJpy: 1000, linkClicks: 100, landingPageViews: 100, signupSource: "tag", funnel: { signups: 5, generated: 0, posted: 0 } }),
      ad({ adKey: "name:B", spendJpy: 9000, linkClicks: 900, landingPageViews: 700 }),
    ]);

    const signups = meta.steps.find((step) => step.key === "signups")!;
    expect(signups).toMatchObject({ previousValue: 100, rateFromPrevious: 0.05, costPerUnitJpy: 200 });
    // ページを開いた段は、両方の広告で出す
    expect(meta.steps.find((step) => step.key === "landingPageViews")).toMatchObject({ value: 800, previousValue: 1000 });
    expect(meta).toMatchObject({ adCount: 2, sourcedAdCount: 1 });
  });

  it("ページを開いた段の分母は、ページを開いた数がある広告のクリックだけ。クリック率も、クリックの数がある広告だけで出す", () => {
    const [meta] = buildPlatformFunnels([
      ad({ adKey: "name:A", impressions: 9000, linkClicks: 900, landingPageViews: null }),
      ad({ adKey: "name:B", impressions: 1000, linkClicks: 100, landingPageViews: 90 }),
      ad({ adKey: "name:C", impressions: 5000, linkClicks: null, landingPageViews: null }),
    ]);

    expect(meta.steps.find((step) => step.key === "landingPageViews")).toMatchObject({
      value: 90,
      previousValue: 100,
      rateFromPrevious: 0.9,
    });
    expect(meta.clickRate).toBe(0.1);
    expect(meta.impressions).toBe(15000);
  });

  it("目印のない広告は数えて知らせる。媒体の並びは Meta・X の順で、広告の無い媒体は出さない", () => {
    const funnels = buildPlatformFunnels([
      ad({ platform: "x", adKey: "1", signupSource: "tag_x", funnel: { signups: 0, generated: 0, posted: 0 } }),
      ad({ platform: "x", adKey: "2" }),
    ]);

    expect(funnels.map((funnel) => funnel.platform)).toEqual(["x"]);
    expect(funnels[0]).toMatchObject({ adCount: 2, sourcedAdCount: 1 });
  });
});

describe("adDailyRange", () => {
  it("広告の最初の日から、最後の日の7日後まで", () => {
    expect(
      adDailyRange(
        [ad({ firstDate: "2026-10-16", lastDate: "2026-10-25" }), ad({ firstDate: "2026-10-26", lastDate: "2026-10-29" })],
        "2026-12-01",
        7,
      ),
    ).toEqual({ from: "2026-10-16", to: "2026-11-05" });
  });

  it("今日より先は描かない", () => {
    expect(adDailyRange([ad({ firstDate: "2026-10-16", lastDate: "2026-10-29" })], "2026-10-30", 7)).toEqual({
      from: "2026-10-16",
      to: "2026-10-30",
    });
  });

  it(`長いときは、終わりから${AD_DAILY_MAX_DAYS}日にする`, () => {
    const range = adDailyRange([ad({ firstDate: "2026-01-01", lastDate: "2026-10-29" })], "2026-12-01", 7)!;

    expect(range.to).toBe("2026-11-05");
    expect(range.from).toBe("2026-08-08");
  });

  it("広告が無ければ null", () => {
    expect(adDailyRange([], "2026-10-30", 7)).toBeNull();
  });
});

describe("buildAdDailyRows", () => {
  const total = (overrides: Partial<AdDailyTotal>): AdDailyTotal => ({
    day: "2026-10-27",
    platform: "meta",
    spendJpy: 0,
    impressions: 0,
    linkClicks: 0,
    landingPageViews: null,
    videoViews: null,
    ...overrides,
  });

  it("期間の日をすべて並べ、広告の無い日は0。登録は、目印を選んだ広告の媒体に数える", () => {
    const rows = buildAdDailyRows(
      { from: "2026-10-26", to: "2026-10-28" },
      [
        total({ day: "2026-10-26", platform: "meta", spendJpy: 1000, linkClicks: 50 }),
        total({ day: "2026-10-27", platform: "x", spendJpy: 800, linkClicks: null }),
        total({ day: "2026-10-01", platform: "meta", spendJpy: 9999 }),
      ],
      [
        { signupSource: "tag_x", day: "2026-10-27" },
        { signupSource: "tag_x", day: "2026-10-27" },
        { signupSource: "unknown_tag", day: "2026-10-27" },
        { signupSource: "tag_x", day: "2026-12-01" },
      ],
      [ad({ platform: "x", adKey: "1", signupSource: "tag_x" })],
    );

    expect(rows).toEqual([
      { day: "2026-10-26", metaSpend: 1000, xSpend: 0, metaClicks: 50, xClicks: 0, metaSignups: 0, xSignups: 0 },
      { day: "2026-10-27", metaSpend: 0, xSpend: 800, metaClicks: 0, xClicks: 0, metaSignups: 0, xSignups: 2 },
      { day: "2026-10-28", metaSpend: 0, xSpend: 0, metaClicks: 0, xClicks: 0, metaSignups: 0, xSignups: 0 },
    ]);
  });

  it("月をまたいでも日が抜けない", () => {
    const rows = buildAdDailyRows({ from: "2026-10-30", to: "2026-11-02" }, [], [], []);
    expect(rows.map((row) => row.day)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("filterSignupDays", () => {
  const windows = [{ signupSource: "tag_x", fromDate: "2026-10-25", toDate: "2026-11-05" }];

  it("日本時間の日付で、目印ごとの期間（両端を含む）に入る登録だけを残し、運営は除く", () => {
    const days = filterSignupDays(
      [
        // 10/24 15:00 UTC = 10/25 0:00 日本時間 → 期間の最初の日
        { userId: "a", signupSource: "tag_x", createdAt: "2026-10-24T15:00:00Z" },
        // 10/24 14:59 UTC = 10/24 23:59 日本時間 → 期間の前
        { userId: "b", signupSource: "tag_x", createdAt: "2026-10-24T14:59:59Z" },
        // 11/05 23:59 日本時間 → 期間の最後の日
        { userId: "c", signupSource: "tag_x", createdAt: "2026-11-05T14:59:59Z" },
        // 11/06 0:00 日本時間 → 期間の後
        { userId: "d", signupSource: "tag_x", createdAt: "2026-11-05T15:00:00Z" },
        { userId: "operator", signupSource: "tag_x", createdAt: "2026-10-27T03:00:00Z" },
        { userId: "e", signupSource: "other_tag", createdAt: "2026-10-27T03:00:00Z" },
      ],
      windows,
      ["operator"],
    );

    expect(days).toEqual([
      { signupSource: "tag_x", day: "2026-10-25" },
      { signupSource: "tag_x", day: "2026-11-05" },
    ]);
  });
});
