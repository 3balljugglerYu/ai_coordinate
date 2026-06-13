import {
  COLLECTION_TREND_CSV_HEADERS,
  buildCollectionOutfitDailyCsv,
  buildCollectionTrendCsv,
} from "@/features/admin-dashboard/lib/build-collection-trend-csv";
import type {
  CollectionKpi,
  CollectionTrendPoint,
} from "@/features/admin-dashboard/lib/build-collection-kpi";

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
