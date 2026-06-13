import type { CollectionTrendPoint } from "./build-collection-kpi";
import { toCsvString } from "./admin-csv";

export const COLLECTION_TREND_CSV_HEADERS = [
  "日付",
  "コンプリート達成数",
  "シリーズ生成数",
  "生成成功",
  "ダウンロード",
  "保存クリック",
  "登録CTAクリック",
] as const;

/**
 * コレクションの日別トレンドを CSV 文字列に変換する(純関数)。
 * - 1 行目はヘッダー、以降は trend の各日 1 行
 * - 改行は CRLF(CSV/Excel 標準)、数値は区切りなしの生値
 */
export function buildCollectionTrendCsv(trend: CollectionTrendPoint[]): string {
  return toCsvString(
    COLLECTION_TREND_CSV_HEADERS,
    trend.map((point) => [
      point.bucket,
      point.completions,
      point.seriesGenerations,
      point.generates,
      point.downloads,
      point.saveClicks,
      point.signupClicks,
    ]),
  );
}
