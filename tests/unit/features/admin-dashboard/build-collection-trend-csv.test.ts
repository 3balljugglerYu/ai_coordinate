import {
  COLLECTION_TREND_CSV_HEADERS,
  buildCollectionOutfitDailyCsv,
  buildCollectionSummaryCsv,
  buildCollectionTrendCsv,
} from "@/features/admin-dashboard/lib/build-collection-trend-csv";
import type {
  CollectionKpi,
  CollectionKpiMetric,
  CollectionTrendPoint,
} from "@/features/admin-dashboard/lib/build-collection-kpi";
import type { CollectionUuFunnel } from "@/features/admin-dashboard/lib/build-collection-uu-funnel";

function point(overrides: Partial<CollectionTrendPoint>): CollectionTrendPoint {
  return {
    bucket: "2026-06-10",
    label: "6/10",
    completions: 0,
    seriesGenerations: 0,
    visitsMember: 0,
    visitsGuest: 0,
    generates: 0,
    generatesGuest: 0,
    downloads: 0,
    downloadsMember: 0,
    downloadsGuest: 0,
    saveClicks: 0,
    signupClicks: 0,
    shares: 0,
    ...overrides,
  };
}

describe("buildCollectionTrendCsv", () => {
  test("空トレンドはヘッダー行のみ", () => {
    expect(buildCollectionTrendCsv([])).toBe(
      COLLECTION_TREND_CSV_HEADERS.join(","),
    );
  });

  test("各日の指標(ログイン/ゲスト内訳含む)を生値で出力し CRLF 区切りにする", () => {
    const csv = buildCollectionTrendCsv([
      point({
        bucket: "2026-06-10",
        completions: 3,
        seriesGenerations: 12,
        visitsMember: 20,
        visitsGuest: 30,
        generates: 8,
        generatesGuest: 5,
        downloads: 5,
        downloadsMember: 2,
        downloadsGuest: 3,
        saveClicks: 2,
        signupClicks: 1,
        shares: 4,
      }),
      point({ bucket: "2026-06-11", completions: 1000 }),
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "日付,コンプリート達成数,シリーズ生成数,訪問(ログイン),訪問(ゲスト),生成成功,お試し生成(ゲスト),ダウンロード,ダウンロード(ログイン),ダウンロード(ゲスト),保存クリック,登録CTAクリック,シェア",
    );
    expect(lines[1]).toBe("2026-06-10,3,12,20,30,8,5,5,2,3,2,1,4");
    expect(lines[2]).toBe("2026-06-11,1000,0,0,0,0,0,0,0,0,0,0,0");
    expect(lines).toHaveLength(3);
  });
});

describe("buildCollectionOutfitDailyCsv", () => {
  test("日付 × 柱名 のクロス集計を出力する", () => {
    const kpi = {
      outfitCounts: [
        { presetId: "a", label: "オーディン", count: 3 },
        { presetId: "b", label: "ゼウス", count: 5 },
      ],
      outfitDaily: [
        { bucket: "2026-06-10", label: "6/10", counts: [1, 2] },
        { bucket: "2026-06-11", label: "6/11", counts: [2, 3] },
      ],
    } as unknown as CollectionKpi;

    const lines = buildCollectionOutfitDailyCsv(kpi).split("\r\n");
    expect(lines[0]).toBe("日付,オーディン,ゼウス");
    expect(lines[1]).toBe("2026-06-10,1,2");
    expect(lines[2]).toBe("2026-06-11,2,3");
  });
});

describe("buildCollectionSummaryCsv", () => {
  function metric(
    current: number,
    previous: number,
    member?: number,
    guest?: number,
  ): CollectionKpiMetric {
    return {
      current,
      previous,
      deltaPct: previous === 0 ? null : 0,
      deltaDirection: "flat",
      ...(member !== undefined ? { member } : {}),
      ...(guest !== undefined ? { guest } : {}),
    };
  }

  test("KPI 期間合計 + UU ファネルを 指標×値 で出力する", () => {
    const kpi = {
      completions: metric(10, 5),
      seriesGenerations: metric(100, 80),
      visitsMember: metric(50, 40),
      visitsGuest: metric(200, 150),
      generates: metric(60, 50, 40, 20),
      downloads: metric(30, 20, 25, 5),
      saveClicks: metric(8, 6),
      signupClicks: metric(12, 10),
      shares: metric(4, 2),
      mountsFailed: metric(1, 0),
    } as unknown as CollectionKpi;
    const uuFunnel: CollectionUuFunnel = {
      generatesUu: 35,
      completionsUu: 10,
      sharesUu: 4,
      reachRatePct: 28.6,
      registeredUu: 20,
      registeredCompletedUu: 6,
      registeredReachRatePct: 30,
      registeredNotCompletedUu: 14,
      completedNotSharedUu: 6,
    };

    const lines = buildCollectionSummaryCsv(kpi, uuFunnel).split("\r\n");
    expect(lines[0]).toBe("指標,今期間,前期間,前期間比(%),ログイン,ゲスト");
    expect(lines[1]).toBe("コンプリート達成数,10,5,0,,");
    expect(lines).toContain("生成成功,60,50,0,40,20");
    expect(lines).toContain("シェア,4,2,0,,");
    expect(lines).toContain("生成UU,35,,,,");
    expect(lines).toContain("コンプリート到達率(%),28.6,,,,");
  });

  test("到達率が null の場合は空欄で出力する", () => {
    const kpi = {
      completions: metric(0, 0),
      seriesGenerations: metric(0, 0),
      visitsMember: metric(0, 0),
      visitsGuest: metric(0, 0),
      generates: metric(0, 0, 0, 0),
      downloads: metric(0, 0, 0, 0),
      saveClicks: metric(0, 0),
      signupClicks: metric(0, 0),
      shares: metric(0, 0),
      mountsFailed: metric(0, 0),
    } as unknown as CollectionKpi;
    const uuFunnel: CollectionUuFunnel = {
      generatesUu: 0,
      completionsUu: 0,
      sharesUu: 0,
      reachRatePct: null,
      registeredUu: 0,
      registeredCompletedUu: 0,
      registeredReachRatePct: null,
      registeredNotCompletedUu: 0,
      completedNotSharedUu: 0,
    };

    const lines = buildCollectionSummaryCsv(kpi, uuFunnel).split("\r\n");
    expect(lines).toContain("コンプリート到達率(%),,,,,");
    expect(lines).toContain("登録→コンプリート率(%),,,,,");
  });
});
