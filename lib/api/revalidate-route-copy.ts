import type { Locale } from "@/i18n/config";

export const revalidateRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    homeFailed: "ホーム画面の更新に失敗しました",
    coordinateFailed: "コーディネート画面の更新に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getRevalidateRouteCopy(locale: Locale) {
  return revalidateRouteCopy[locale];
}
