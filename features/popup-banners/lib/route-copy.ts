import type { Locale } from "@/i18n/config";

export const popupBannersRouteCopy = {
  ja: {
    activeFetchFailed: "ポップアップバナーの取得に失敗しました",
    authRequired: "ログインが必要です",
    historyFetchFailed: "表示履歴の取得に失敗しました",
    interactFailed: "ポップアップ操作の記録に失敗しました",
    invalidAction: "不正な操作種別です",
    invalidRequest: "リクエストが不正です",
    analyticsFetchFailed: "アナリティクスの取得に失敗しました",
    notFound: "ポップアップバナーが見つかりません",
    dismissForeverForbidden:
      "このバナーは「次回から表示しない」に対応していません",
  },
  en: {
    activeFetchFailed: "Failed to load popup banners.",
    authRequired: "Authentication is required.",
    historyFetchFailed: "Failed to load popup banner history.",
    interactFailed: "Failed to record the popup banner interaction.",
    invalidAction: "Invalid popup banner action.",
    invalidRequest: "Invalid popup banner request.",
    analyticsFetchFailed: "Failed to load popup banner analytics.",
    notFound: "Popup banner was not found.",
    dismissForeverForbidden:
      "This popup banner does not support permanent dismissal.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getPopupBannersRouteCopy(locale: Locale) {
  return popupBannersRouteCopy[locale];
}
