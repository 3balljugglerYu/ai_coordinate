import type {
  BlockStatusResponse,
  ReportPostRequest,
  ReportPostResponse,
} from "@/features/moderation/types";

export async function reportPostAPI(
  request: ReportPostRequest
): Promise<ReportPostResponse> {
  const response = await fetch("/api/reports/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "通報に失敗しました");
  }

  return response.json();
}

export async function blockUserAPI(userId: string): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}/block`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "ブロックに失敗しました");
  }
}

export async function unblockUserAPI(userId: string): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}/block`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "ブロック解除に失敗しました");
  }
}

export async function getBlockStatusAPI(
  userId: string
): Promise<BlockStatusResponse> {
  const response = await fetch(
    `/api/users/${encodeURIComponent(userId)}/block-status`
  );

  if (!response.ok) {
    if (response.status === 401) {
      return { isBlocked: false, isBlockedBy: false };
    }
    const error = await response.json();
    throw new Error(error.error || "ブロック状態の取得に失敗しました");
  }

  return response.json();
}
