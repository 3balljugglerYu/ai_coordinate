import type { Locale } from "@/i18n/config";

export const myPageRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    imageFetchFailed: "画像の取得に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getMyPageRouteCopy(locale: Locale) {
  return myPageRouteCopy[locale];
}
