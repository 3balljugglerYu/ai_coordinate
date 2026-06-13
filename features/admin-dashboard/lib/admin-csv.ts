import type {
  DashboardOneTapStyleTrendPoint,
  DashboardTrendPoint,
} from "./dashboard-types";

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * ヘッダー + 行(文字列 or 数値)を CSV 文字列にする(純関数)。
 * - 改行は CRLF(CSV/Excel 標準)、数値は区切りなしの生値
 */
export function toCsvString(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): string {
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((value) => escapeCsvField(String(value))).join(","),
    ),
  ];
  return lines.join("\r\n");
}

/** トレンド配列の最初/最後の bucket からファイル名サフィックスを作る。 */
export function csvDateSpanSuffix(buckets: readonly string[]): string {
  if (buckets.length === 0) {
    return "all";
  }
  return `${buckets[0]}_${buckets[buckets.length - 1]}`;
}

// ---- 「すべて」タブ: ユーザー・生成トレンド ----
export const DASHBOARD_TREND_CSV_HEADERS = [
  "日付",
  "新規登録数",
  "生成完了数",
] as const;

export function buildDashboardTrendCsv(trend: DashboardTrendPoint[]): string {
  return toCsvString(
    DASHBOARD_TREND_CSV_HEADERS,
    trend.map((point) => [point.bucket, point.signups, point.generations]),
  );
}

// ---- 「ワンタップスタイル」: One-Tap Style 日別トレンド ----
export const ONE_TAP_STYLE_TREND_CSV_HEADERS = [
  "日付",
  "訪問数",
  "生成成功数",
  "登録CTAクリック",
  "登録完了",
  "保存クリック",
  "保存完了",
] as const;

export function buildOneTapStyleTrendCsv(
  trend: DashboardOneTapStyleTrendPoint[],
): string {
  return toCsvString(
    ONE_TAP_STYLE_TREND_CSV_HEADERS,
    trend.map((point) => [
      point.bucket,
      point.visits,
      point.generations,
      point.signupClicks,
      point.signupCompletions,
      point.wardrobeSaveClicks,
      point.wardrobeSaveCompletions,
    ]),
  );
}
