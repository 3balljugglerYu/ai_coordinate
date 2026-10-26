import { startOfJstDay, type DashboardRange } from "./dashboard-range";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日ごとのグラフを最低何日分描くか。24h では1〜2点しか出ず、線にならないため。 */
export const MIN_CHART_DAYS = 7;

const RANGE_DAYS: Record<DashboardRange, number> = {
  "24h": MIN_CHART_DAYS,
  "7d": MIN_CHART_DAYS,
  "30d": 30,
  "90d": 90,
};

/**
 * 日ごとのグラフの範囲(OV-7)。
 *
 * - 24h・7d は直近7日、30d・90d はその日数。今日を含めて数える
 * - **始まりは日本時間の 0:00 にそろえる**。今の期間(「今」から N日前の同じ時刻)のまま
 *   描くと、左端の日が途中からの数になり、線が急に下がって見えるため
 *   (その日に出来事の印があると、出来事のせいで下がったように読めてしまう)
 * - 右端の日(今日)は途中までの数。画面にそう書く
 *
 * 今の期間・前の期間の合計とは範囲が違うので、日ごとの出入りと出来事の印は、この範囲で別に取る。
 */
export function getChartRange(
  range: DashboardRange,
  now: Date,
): { start: Date; end: Date; days: number } {
  const days = RANGE_DAYS[range];
  const todayStart = startOfJstDay(now);
  return {
    start: new Date(todayStart.getTime() - (days - 1) * DAY_MS),
    end: now,
    days,
  };
}
