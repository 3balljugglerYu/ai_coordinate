/**
 * 連続ログイン（ストリーク）関連のユーティリティ
 */

export function getJstDateString(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 連続チェックインが途切れているか（継続条件外か）を判定する
 * 継続条件: 前回チェックインが昨日であること
 * それ以外（2日以上空いた、または未チェックイン）はリセット対象
 */
export function isStreakBroken(lastStreakLoginAt: string | null): boolean {
  if (!lastStreakLoginAt) return true;
  const lastJst = getJstDateString(new Date(lastStreakLoginAt));
  const todayJst = getJstDateString(new Date());
  if (lastJst === todayJst) return false; // 本日チェックイン済み
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayJst = getJstDateString(yesterday);
  if (lastJst === yesterdayJst) return false; // 昨日チェックイン → 継続中
  return true; // 2日以上空いている → 継続条件外
}
