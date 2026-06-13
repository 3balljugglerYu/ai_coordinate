import {
  COLLECTION_TREND_CSV_HEADERS,
  buildCollectionTrendCsv,
} from "@/features/admin-dashboard/lib/build-collection-trend-csv";
import type { CollectionTrendPoint } from "@/features/admin-dashboard/lib/build-collection-kpi";

function point(overrides: Partial<CollectionTrendPoint>): CollectionTrendPoint {
  return {
    bucket: "2026-06-10",
    label: "6/10",
    completions: 0,
    seriesGenerations: 0,
    generates: 0,
    downloads: 0,
    saveClicks: 0,
    signupClicks: 0,
    ...overrides,
  };
}

describe("buildCollectionTrendCsv", () => {
  test("空トレンドはヘッダー行のみ", () => {
    expect(buildCollectionTrendCsv([])).toBe(
      COLLECTION_TREND_CSV_HEADERS.join(","),
    );
  });

  test("各日の指標を生値で出力し CRLF 区切りにする", () => {
    const csv = buildCollectionTrendCsv([
      point({
        bucket: "2026-06-10",
        completions: 3,
        seriesGenerations: 12,
        generates: 8,
        downloads: 5,
        saveClicks: 2,
        signupClicks: 1,
      }),
      point({ bucket: "2026-06-11", completions: 1000 }),
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "日付,コンプリート達成数,シリーズ生成数,生成成功,ダウンロード,保存クリック,登録CTAクリック",
    );
    expect(lines[1]).toBe("2026-06-10,3,12,8,5,2,1");
    // 区切り記号なしの生値(スプレッドシートで数値として扱える)
    expect(lines[2]).toBe("2026-06-11,1000,0,0,0,0,0");
    expect(lines).toHaveLength(3);
  });
});
