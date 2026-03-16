import type { BlockedUserItem, ReportedContentItem } from "@/features/account/types";

interface AccountApiMessages {
  blockedUsersFetchFailed?: string;
  unblockFailed?: string;
  reportedContentsFetchFailed?: string;
  withdrawReportFailed?: string;
}

export async function getBlockedUsersAPI(
  messages?: AccountApiMessages
): Promise<BlockedUserItem[]> {
  const response = await fetch("/api/account/blocks");
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error ||
        messages?.blockedUsersFetchFailed ||
        "ブロックユーザー一覧の取得に失敗しました"
    );
  }
  const payload = await response.json();
  return payload.items || [];
}

export async function unblockUserFromAccountAPI(
  blockedUserId: string,
  messages?: AccountApiMessages
): Promise<void> {
  const response = await fetch(`/api/account/blocks/${encodeURIComponent(blockedUserId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error || messages?.unblockFailed || "ブロック解除に失敗しました"
    );
  }
}

export async function getReportedContentsAPI(
  messages?: AccountApiMessages
): Promise<ReportedContentItem[]> {
  const response = await fetch("/api/account/reports");
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error ||
        messages?.reportedContentsFetchFailed ||
        "通報済みコンテンツ一覧の取得に失敗しました"
    );
  }
  const payload = await response.json();
  return payload.items || [];
}

export async function withdrawReportAPI(
  postId: string,
  messages?: AccountApiMessages
): Promise<void> {
  const response = await fetch(`/api/account/reports/${encodeURIComponent(postId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      payload?.error || messages?.withdrawReportFailed || "通報解除に失敗しました"
    );
  }
}
