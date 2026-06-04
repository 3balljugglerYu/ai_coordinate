import {
  enumerateJstDateKeys,
  formatJstDateLabel,
  toJstDateKey,
} from "./dashboard-range";
import type {
  DashboardDauMauSummary,
  DashboardDauMauTrendPoint,
} from "./dashboard-types";

export interface DauMauActivityRow {
  user_id: string | null;
  created_at: string;
}

/** MAU の集計窓 = 直近30日(当日含む)= 30 日キー */
const MAU_WINDOW_DAYS = 30;

/**
 * ログイン実ユーザーの DAU/MAU を算出する純粋関数。
 * active = その JST 日に user_id 非 null の活動行(generated_images)を持つユーザー。
 * - dau: 当日(JST)の distinct ユーザー数
 * - mau: 直近30日(JST・当日含む)の distinct ユーザー数
 * - stickinessPct: dau / mau * 100(小数1桁)。mau=0 のとき null
 * - trend: 直近30日の日別 distinct ユーザー数(JST 昇順・30点)
 */
export function buildDauMau(params: {
  activity: DauMauActivityRow[];
  now: Date;
}): DashboardDauMauSummary {
  const { activity, now } = params;

  const windowStart = new Date(
    now.getTime() - (MAU_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000
  );
  const dateKeys = enumerateJstDateKeys(windowStart, now);
  const todayKey = toJstDateKey(now);

  const usersByDay = new Map<string, Set<string>>(
    dateKeys.map((key) => [key, new Set<string>()])
  );
  const mauUsers = new Set<string>();

  for (const row of activity) {
    if (!row.user_id) {
      continue; // ゲスト(非ログイン)は除外
    }
    const key = toJstDateKey(row.created_at);
    const dayUsers = usersByDay.get(key);
    if (!dayUsers) {
      continue; // 集計窓の外は無視
    }
    dayUsers.add(row.user_id);
    mauUsers.add(row.user_id);
  }

  const trend: DashboardDauMauTrendPoint[] = dateKeys.map((key) => ({
    bucket: key,
    label: formatJstDateLabel(key),
    count: usersByDay.get(key)!.size,
  }));

  // todayKey は enumerateJstDateKeys(..., now) の末尾として必ず dateKeys に含まれる
  const dau = usersByDay.get(todayKey)!.size;
  const mau = mauUsers.size;
  const stickinessPct =
    mau > 0 ? Number(((dau / mau) * 100).toFixed(1)) : null;

  return { dau, mau, stickinessPct, trend };
}
