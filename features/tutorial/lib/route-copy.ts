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
  ko: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  "zh-CN": {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  "zh-TW": {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  es: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  pt: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  fr: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  de: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  it: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  id: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  th: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  vi: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  hi: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
  ar: {
    authRequired: "You need to be logged in.",
    tutorialCompleteFailed: "Failed to complete the tutorial flow.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getTutorialRouteCopy(locale: Locale) {
  return tutorialRouteCopy[locale];
}
