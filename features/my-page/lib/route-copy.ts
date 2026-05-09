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
  ko: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  "zh-CN": {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  "zh-TW": {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  es: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  pt: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  fr: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  de: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  it: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  id: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  th: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  vi: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  hi: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
  ar: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getMyPageRouteCopy(locale: Locale) {
  return myPageRouteCopy[locale];
}
