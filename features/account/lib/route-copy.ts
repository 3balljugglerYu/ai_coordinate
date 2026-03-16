import type { Locale } from "@/i18n/config";

export const accountRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    blockedUsersFetchFailed: "ブロックユーザー一覧の取得に失敗しました",
    blockedUserProfilesFetchFailed: "ブロックユーザー情報の取得に失敗しました",
    blockedUserIdRequired: "ユーザーIDが必要です",
    unblockFailed: "ブロック解除に失敗しました",
    reportedContentsFetchFailed: "通報済みコンテンツ一覧の取得に失敗しました",
    reportedPostsFetchFailed: "通報対象投稿の取得に失敗しました",
    postIdRequired: "投稿IDが必要です",
    withdrawReportFailed: "通報解除に失敗しました",
    invalidDeactivateRequest: "無効なリクエストです",
    deactivateConfirmRequired: "確認テキストに DELETE を入力してください",
    deactivatePasswordRequired: "本人確認のためパスワードが必要です",
    deactivatePasswordInvalid: "パスワードが正しくありません",
    deactivateFailed: "退会申請に失敗しました",
    reactivateFailed: "アカウント復帰に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    blockedUsersFetchFailed: "Failed to load the blocked users list.",
    blockedUserProfilesFetchFailed: "Failed to load blocked user profiles.",
    blockedUserIdRequired: "A user ID is required.",
    unblockFailed: "Failed to unblock the user.",
    reportedContentsFetchFailed: "Failed to load the reported content list.",
    reportedPostsFetchFailed: "Failed to load the reported posts.",
    postIdRequired: "A post ID is required.",
    withdrawReportFailed: "Failed to withdraw the report.",
    invalidDeactivateRequest: "The request is invalid.",
    deactivateConfirmRequired: "Enter DELETE in the confirmation field.",
    deactivatePasswordRequired: "Your password is required to verify your identity.",
    deactivatePasswordInvalid: "The password is incorrect.",
    deactivateFailed: "Failed to schedule account deletion.",
    reactivateFailed: "Failed to reactivate the account.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getAccountRouteCopy(locale: Locale) {
  return accountRouteCopy[locale];
}
