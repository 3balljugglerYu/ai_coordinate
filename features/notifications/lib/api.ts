import type {
  Notification,
  NotificationsResponse,
  UnreadCountResponse,
} from "../types";

interface NotificationApiMessages {
  fetchFailed?: string;
  markReadFailed?: string;
  markAllReadFailed?: string;
  unreadCountFailed?: string;
}

/**
 * 通知機能のクライアントサイドAPI関数
 */

/**
 * 通知一覧を取得
 */
export async function getNotifications(
  limit: number = 20,
  cursor: string | null = null,
  messages?: NotificationApiMessages
): Promise<NotificationsResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (cursor) {
    params.append("cursor", cursor);
  }

  const response = await fetch(`/api/notifications?${params.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(error?.error || messages?.fetchFailed || "通知の取得に失敗しました");
  }

  return response.json();
}

/**
 * 通知を既読化
 */
export async function markNotificationsRead(
  ids: string[],
  messages?: NotificationApiMessages
): Promise<{ success: boolean }> {
  const response = await fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.markReadFailed || "通知の既読化に失敗しました"
    );
  }

  return response.json();
}

/**
 * 全通知を既読化
 */
export async function markAllNotificationsRead(
  messages?: NotificationApiMessages
): Promise<{
  success: boolean;
}> {
  const response = await fetch("/api/notifications/mark-all-read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.markAllReadFailed || "全件既読化に失敗しました"
    );
  }

  return response.json();
}

/**
 * 未読数を取得
 */
export async function getUnreadCount(
  messages?: NotificationApiMessages
): Promise<number> {
  const response = await fetch("/api/notifications/unread-count", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    return 0;
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error ||
        messages?.unreadCountFailed ||
        "未読数の取得に失敗しました"
    );
  }

  const data: UnreadCountResponse = await response.json();
  return data.count;
}
