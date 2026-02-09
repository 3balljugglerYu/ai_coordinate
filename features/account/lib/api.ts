import type { BlockedUserItem, ReportedContentItem } from "@/features/account/types";

export async function getBlockedUsersAPI(): Promise<BlockedUserItem[]> {
  const response = await fetch("/api/account/blocks");
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "ブロックユーザー一覧の取得に失敗しました");
  }
  const payload = await response.json();
  return payload.items || [];
}

export async function unblockUserFromAccountAPI(blockedUserId: string): Promise<void> {
  const response = await fetch(`/api/account/blocks/${encodeURIComponent(blockedUserId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "ブロック解除に失敗しました");
  }
}

export async function getReportedContentsAPI(): Promise<ReportedContentItem[]> {
  const response = await fetch("/api/account/reports");
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "通報済みコンテンツ一覧の取得に失敗しました");
  }
  const payload = await response.json();
  return payload.items || [];
}

export async function withdrawReportAPI(postId: string): Promise<void> {
  const response = await fetch(`/api/account/reports/${encodeURIComponent(postId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "通報解除に失敗しました");
  }
}
