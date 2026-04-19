import type {
  AnnouncementDetail,
  AnnouncementSummary,
  AnnouncementUnreadState,
  AnnouncementSeenSurface,
} from "./schema";

interface AnnouncementApiMessages {
  fetchListFailed?: string;
  fetchDetailFailed?: string;
  markReadFailed?: string;
  markSeenFailed?: string;
  unreadStateFailed?: string;
}

export async function getAnnouncements(
  messages?: AnnouncementApiMessages
): Promise<AnnouncementSummary[]> {
  const response = await fetch("/api/announcements", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    return [];
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.fetchListFailed || "お知らせ一覧の取得に失敗しました"
    );
  }

  const data = (await response.json()) as { announcements: AnnouncementSummary[] };
  return data.announcements;
}

export async function getAnnouncement(
  id: string,
  messages?: AnnouncementApiMessages
): Promise<AnnouncementDetail> {
  const response = await fetch(`/api/announcements/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.fetchDetailFailed || "お知らせ詳細の取得に失敗しました"
    );
  }

  return response.json();
}

export async function markAnnouncementRead(
  id: string,
  messages?: AnnouncementApiMessages
): Promise<void> {
  const response = await fetch(`/api/announcements/${id}/read`, {
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
      error?.error || messages?.markReadFailed || "お知らせの既読化に失敗しました"
    );
  }
}

export async function markAnnouncementSeen(
  surface: AnnouncementSeenSurface,
  messages?: AnnouncementApiMessages
): Promise<void> {
  const response = await fetch("/api/announcements/seen", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ surface }),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error || messages?.markSeenFailed || "既読状態の更新に失敗しました"
    );
  }
}

export async function getAnnouncementUnreadState(
  messages?: AnnouncementApiMessages
): Promise<AnnouncementUnreadState> {
  const response = await fetch("/api/announcements/unread-state", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    return {
      hasPageDot: false,
      hasTabDot: false,
      latestPublishedAt: null,
    };
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      error?.error ||
        messages?.unreadStateFailed ||
        "お知らせ未読状態の取得に失敗しました"
    );
  }

  return response.json();
}
