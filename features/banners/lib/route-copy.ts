import type { Locale } from "@/i18n/config";

export const bannersRouteCopy = {
  ja: {
    fetchFailed: "バナーの取得に失敗しました",
  },
  en: {
    fetchFailed: "Failed to load banners.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getBannersRouteCopy(locale: Locale) {
  return bannersRouteCopy[locale];
}
