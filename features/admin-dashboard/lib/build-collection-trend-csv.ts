import type { CollectionTrendPoint } from "./build-collection-kpi";

export const COLLECTION_TREND_CSV_HEADERS = [
  "日付",
  "コンプリート達成数",
  "シリーズ生成数",
  "生成成功",
  "ダウンロード",
  "保存クリック",
  "登録CTAクリック",
] as const;

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * コレクションの日別トレンドを CSV 文字列に変換する(純関数)。
 * - 1 行目はヘッダー、以降は trend の各日 1 行
 * - 改行は CRLF(CSV/Excel 標準)、数値は区切りなしの生値
 */
export function buildCollectionTrendCsv(trend: CollectionTrendPoint[]): string {
  const lines = [
    COLLECTION_TREND_CSV_HEADERS.join(","),
    ...trend.map((point) =>
      [
        point.bucket,
        point.completions,
        point.seriesGenerations,
        point.generates,
        point.downloads,
        point.saveClicks,
        point.signupClicks,
      ]
        .map((value) => escapeCsvField(String(value)))
        .join(","),
    ),
  ];
  return lines.join("\r\n");
}
