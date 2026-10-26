import type { DashboardRange } from "./dashboard-range";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日ごとのグラフを最低何日分描くか。24h では1〜2点しか出ず、線にならないため。 */
export const MIN_CHART_DAYS = 7;

/**
 * 日ごとのグラフの範囲(OV-7)。
 *
 * 24h・7d のときは直近7日、30d・90d のときは選んだ期間。
 * 取得の前にここで決め、日ごとの出入りと出来事の印は、この範囲で別に取る
 * (今の期間・前の期間の合計とは範囲が違うことがあるため)。
 */
export function getChartRange(
  range: DashboardRange,
  currentStart: Date,
  now: Date,
): { start: Date; end: Date; sameAsCurrent: boolean } {
  const minStart = new Date(now.getTime() - MIN_CHART_DAYS * DAY_MS);
  if (range === "24h" || range === "7d") {
    return { start: minStart, end: now, sameAsCurrent: range === "7d" };
  }
  return { start: currentStart, end: now, sameAsCurrent: true };
}
