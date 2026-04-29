import type { Locale } from "@/i18n/config";

export const coordinateStocksRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    invalidRequest: "リクエストが不正です",
    unreadStateFailed: "ストックの未確認状態の取得に失敗しました",
    markSeenFailed: "ストックタブの既読状態の更新に失敗しました",
    linkStockFailed: "ストックの紐づけに失敗しました",
    stockNotFound: "ストック画像が見つかりません",
    tooManyJobs: "一度に紐づけできる生成は 4 件までです",
  },
  en: {
    authRequired: "You need to be logged in.",
    invalidRequest: "The request was invalid.",
    unreadStateFailed: "Failed to load the stock unread state.",
    markSeenFailed: "Failed to update the stock tab seen state.",
    linkStockFailed: "Failed to link the stock to your generations.",
    stockNotFound: "Stock image not found.",
    tooManyJobs: "Up to 4 generations can be linked at once.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getCoordinateStocksRouteCopy(locale: Locale) {
  return coordinateStocksRouteCopy[locale];
}
