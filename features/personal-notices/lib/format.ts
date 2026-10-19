/** 管理画面の日時(日本時間・秒なし)例: 2026-11-07 20:00 */
export function formatPersonalNoticeAdminDate(value: string | null): string {
  if (!value) return "";
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 16);
}
