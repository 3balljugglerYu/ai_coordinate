import type { Locale } from "@/i18n/config";

export const revalidateRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    homeFailed: "ホーム画面の更新に失敗しました",
    coordinateFailed: "コーディネート画面の更新に失敗しました",
    myPageFailed: "マイページの更新に失敗しました",
    styleFailed: "スタイル画面の更新に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  ko: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  "zh-CN": {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  "zh-TW": {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  es: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  pt: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  fr: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  de: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  it: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  id: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  th: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  vi: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  hi: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
  ar: {
    authRequired: "You need to be logged in.",
    homeFailed: "Failed to refresh the home feed.",
    coordinateFailed: "Failed to refresh the coordinate screen.",
    myPageFailed: "Failed to refresh my page.",
    styleFailed: "Failed to refresh the style screen.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getRevalidateRouteCopy(locale: Locale) {
  return revalidateRouteCopy[locale];
}
