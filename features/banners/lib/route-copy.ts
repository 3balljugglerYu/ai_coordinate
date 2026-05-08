import type { Locale } from "@/i18n/config";

export const bannersRouteCopy = {
  ja: {
    fetchFailed: "バナーの取得に失敗しました",
  },
  en: {
    fetchFailed: "Failed to load banners.",
  },
  ko: {
    fetchFailed: "Failed to load banners.",
  },
  "zh-CN": {
    fetchFailed: "Failed to load banners.",
  },
  "zh-TW": {
    fetchFailed: "Failed to load banners.",
  },
  es: {
    fetchFailed: "Failed to load banners.",
  },
  pt: {
    fetchFailed: "Failed to load banners.",
  },
  fr: {
    fetchFailed: "Failed to load banners.",
  },
  de: {
    fetchFailed: "Failed to load banners.",
  },
  it: {
    fetchFailed: "Failed to load banners.",
  },
  id: {
    fetchFailed: "Failed to load banners.",
  },
  th: {
    fetchFailed: "Failed to load banners.",
  },
  vi: {
    fetchFailed: "Failed to load banners.",
  },
  hi: {
    fetchFailed: "Failed to load banners.",
  },
  ar: {
    fetchFailed: "Failed to load banners.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getBannersRouteCopy(locale: Locale) {
  return bannersRouteCopy[locale];
}
