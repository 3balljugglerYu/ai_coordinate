import type { Locale } from "@/i18n/config";

export const myPageRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    imageFetchFailed: "画像の取得に失敗しました",
    bulkDeleteInvalidInput: "削除対象の指定が不正です",
    bulkDeleteFailed: "画像の一括削除に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  ko: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  "zh-CN": {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  "zh-TW": {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  es: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  pt: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  fr: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  de: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  it: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  id: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  th: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  vi: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  hi: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
  ar: {
    authRequired: "You need to be logged in.",
    imageFetchFailed: "Failed to load the images.",
    bulkDeleteInvalidInput: "Invalid selection for bulk delete.",
    bulkDeleteFailed: "Failed to delete the selected images.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getMyPageRouteCopy(locale: Locale) {
  return myPageRouteCopy[locale];
}
