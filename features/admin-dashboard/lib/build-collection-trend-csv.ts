import type { CollectionKpi, CollectionTrendPoint } from "./build-collection-kpi";
import { toCsvString } from "./admin-csv";

export const COLLECTION_TREND_CSV_HEADERS = [
  "日付",
  "コンプリート達成数",
  "シリーズ生成数",
  "訪問(ログイン)",
  "訪問(ゲスト)",
  "生成成功",
  "お試し生成(ゲスト)",
  "ダウンロード",
  "ダウンロード(ログイン)",
  "ダウンロード(ゲスト)",
  "保存クリック",
  "登録CTAクリック",
  "シェア",
] as const;

/**
 * コレクションの日別トレンドを CSV 文字列に変換する(純関数)。
 * - 1 行目はヘッダー、以降は trend の各日 1 行
 * - 訪問/生成/ダウンロードはログイン・ゲスト内訳列も出力
 * - 改行は CRLF(CSV/Excel 標準)、数値は区切りなしの生値
 */
export function buildCollectionTrendCsv(trend: CollectionTrendPoint[]): string {
  return toCsvString(
    COLLECTION_TREND_CSV_HEADERS,
    trend.map((point) => [
      point.bucket,
      point.completions,
      point.seriesGenerations,
      point.visitsMember,
      point.visitsGuest,
      point.generates,
      point.generatesGuest,
      point.downloads,
      point.downloadsMember,
      point.downloadsGuest,
      point.saveClicks,
      point.signupClicks,
      point.shares,
    ]),
  );
}

/**
 * 日別 × 柱別の生成数(B-3)を CSV 文字列にする。
 * - ヘッダー: 日付, <柱名...>(outfitCounts の柱順)
 * - 各行: その日の各柱の生成数
 */
export function buildCollectionOutfitDailyCsv(kpi: CollectionKpi): string {
  const headers = ["日付", ...kpi.outfitCounts.map((outfit) => outfit.label)];
  const rows = kpi.outfitDaily.map((point) => [point.bucket, ...point.counts]);
  return toCsvString(headers, rows);
}
