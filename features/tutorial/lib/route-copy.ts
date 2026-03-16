import type { Locale } from "@/i18n/config";

export const tutorialRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    tutorialCompleteFailed: "チュートリアル完了の処理に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getTutorialRouteCopy(locale: Locale) {
  return tutorialRouteCopy[locale];
}
