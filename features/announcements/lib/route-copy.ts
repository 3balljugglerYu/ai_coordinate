import type { Locale } from "@/i18n/config";

export const announcementsRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    invalidRequest: "リクエストが不正です",
    fetchListFailed: "お知らせ一覧の取得に失敗しました",
    fetchDetailFailed: "お知らせ詳細の取得に失敗しました",
    notFound: "お知らせが見つかりません",
    markReadFailed: "お知らせの既読化に失敗しました",
    markSeenFailed: "既読状態の更新に失敗しました",
    unreadStateFailed: "お知らせの未読状態取得に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    invalidRequest: "The request was invalid.",
    fetchListFailed: "Failed to load announcements.",
    fetchDetailFailed: "Failed to load the announcement.",
    notFound: "Announcement not found.",
    markReadFailed: "Failed to mark the announcement as read.",
    markSeenFailed: "Failed to update the seen state.",
    unreadStateFailed: "Failed to load the announcement unread state.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getAnnouncementsRouteCopy(locale: Locale) {
  return announcementsRouteCopy[locale];
}
