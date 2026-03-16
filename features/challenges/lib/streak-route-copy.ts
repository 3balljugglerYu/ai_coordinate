import type { Locale } from "@/i18n/config";

export const streakRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    streakStatusFailed: "特典ステータスの取得に失敗しました",
    streakBonusFailed: "特典の確認に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    streakStatusFailed: "Failed to load the streak status.",
    streakBonusFailed: "Failed to verify the streak bonus.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getStreakRouteCopy(locale: Locale) {
  return streakRouteCopy[locale];
}
