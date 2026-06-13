import type {
  CollectionKpi,
  CollectionKpiMetric,
  CollectionTrendPoint,
} from "./build-collection-kpi";
import type { CollectionUuFunnel } from "./build-collection-uu-funnel";
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

export const COLLECTION_SUMMARY_CSV_HEADERS = [
  "指標",
  "今期間",
  "前期間",
  "前期間比(%)",
  "ログイン",
  "ゲスト",
] as const;

function summaryRow(
  label: string,
  metric: CollectionKpiMetric,
): (string | number)[] {
  return [
    label,
    metric.current,
    metric.previous,
    metric.deltaPct ?? "",
    metric.member ?? "",
    metric.guest ?? "",
  ];
}

/**
 * 期間サマリー(期間合計)を CSV 文字列にする。
 * - 各 KPI 指標の 今期間/前期間/前期間比 と、分離可能な指標の ログイン/ゲスト 内訳
 * - 続けて UU ファネル(B-2/A-5/A-8)の指標を出力
 */
export function buildCollectionSummaryCsv(
  kpi: CollectionKpi,
  uuFunnel: CollectionUuFunnel,
): string {
  const pct = (value: number | null): string | number => (value === null ? "" : value);
  const uuRow = (label: string, value: string | number): (string | number)[] => [
    label,
    value,
    "",
    "",
    "",
    "",
  ];
  const rows: (string | number)[][] = [
    summaryRow("コンプリート達成数", kpi.completions),
    summaryRow("シリーズ生成数(成功)", kpi.seriesGenerations),
    summaryRow("訪問(ログイン)", kpi.visitsMember),
    summaryRow("訪問(ゲスト)", kpi.visitsGuest),
    summaryRow("生成成功", kpi.generates),
    summaryRow("ダウンロード", kpi.downloads),
    summaryRow("保存クリック", kpi.saveClicks),
    summaryRow("登録CTAクリック", kpi.signupClicks),
    summaryRow("シェア", kpi.shares),
    summaryRow("台紙生成失敗", kpi.mountsFailed),
    uuRow("生成UU", uuFunnel.generatesUu),
    uuRow("コンプリートUU", uuFunnel.completionsUu),
    uuRow("シェアUU", uuFunnel.sharesUu),
    uuRow("コンプリート到達率(%)", pct(uuFunnel.reachRatePct)),
    uuRow("期間内登録UU", uuFunnel.registeredUu),
    uuRow("登録→コンプリートUU", uuFunnel.registeredCompletedUu),
    uuRow("登録→コンプリート率(%)", pct(uuFunnel.registeredReachRatePct)),
    uuRow("登録後 未コンプリートUU", uuFunnel.registeredNotCompletedUu),
    uuRow("コンプリート後 未シェアUU", uuFunnel.completedNotSharedUu),
  ];
  return toCsvString(COLLECTION_SUMMARY_CSV_HEADERS, rows);
}
