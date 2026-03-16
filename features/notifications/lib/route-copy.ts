import type { Locale } from "@/i18n/config";

export const notificationsRouteCopy = {
  ja: {
    authRequired: "認証が必要です",
    invalidLimit: "取得件数は1件から100件の間で指定してください",
    fetchFailed: "通知の取得に失敗しました",
    idsRequired: "ids 配列が必要です",
    maxIdsExceeded: "一度に既読化できる通知は100件までです",
    markReadFailed: "通知の既読化に失敗しました",
    markAllReadFailed: "全件既読化に失敗しました",
    unreadCountFailed: "未読数の取得に失敗しました",
  },
  en: {
    authRequired: "You need to be logged in.",
    invalidLimit: "Limit must be between 1 and 100.",
    fetchFailed: "Failed to load notifications.",
    idsRequired: "An ids array is required.",
    maxIdsExceeded: "You can mark up to 100 notifications as read at once.",
    markReadFailed: "Failed to mark notifications as read.",
    markAllReadFailed: "Failed to mark all notifications as read.",
    unreadCountFailed: "Failed to load the unread count.",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function getNotificationsRouteCopy(locale: Locale) {
  return notificationsRouteCopy[locale];
}
