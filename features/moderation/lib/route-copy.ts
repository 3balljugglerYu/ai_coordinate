import type { Locale } from "@/i18n/config";

export const moderationRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    invalidRequest: "不正なリクエストです",
    rateLimitCheckFailed: "通報制限の確認に失敗しました",
    rateLimitShort:
      "短時間での通報回数が上限に達しました。しばらくしてから再試行してください。",
    rateLimitDaily:
      "1日の通報回数が上限に達しました。翌日に再試行してください。",
    postFetchFailed: "投稿情報の取得に失敗しました",
    postNotFound: "投稿が見つかりません",
    reportScoreFailed: "通報評価の計算に失敗しました",
    reportAlreadyExists: "この投稿は既に通報済みです",
    reportCreateFailed: "通報の登録に失敗しました",
    reportAggregationFailed: "通報集計の取得に失敗しました",
    pendingUpdateFailed: "審査ステータスの更新に失敗しました",
    reportFailed: "通報に失敗しました",
    userIdRequired: "ユーザーIDが必要です",
    cannotBlockSelf: "自分自身をブロックすることはできません",
    blockFailed: "ブロックに失敗しました",
    unblockFailed: "ブロック解除に失敗しました",
    blockStatusFailed: "ブロック状態の取得に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    invalidRequest: "The request is invalid.",
    rateLimitCheckFailed: "Failed to verify the report limit.",
    rateLimitShort:
      "You have reached the short-term report limit. Please try again later.",
    rateLimitDaily:
      "You have reached the daily report limit. Please try again tomorrow.",
    postFetchFailed: "Failed to fetch the post information.",
    postNotFound: "The post could not be found.",
    reportScoreFailed: "Failed to calculate the report score.",
    reportAlreadyExists: "You have already reported this post.",
    reportCreateFailed: "Failed to submit the report.",
    reportAggregationFailed: "Failed to load the report metrics.",
    pendingUpdateFailed: "Failed to update the moderation status.",
    reportFailed: "Failed to report the post.",
    userIdRequired: "A user ID is required.",
    cannotBlockSelf: "You cannot block yourself.",
    blockFailed: "Failed to block the user.",
    unblockFailed: "Failed to unblock the user.",
    blockStatusFailed: "Failed to load the block status.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getModerationRouteCopy(locale: Locale) {
  return moderationRouteCopy[locale];
}
