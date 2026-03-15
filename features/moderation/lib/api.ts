import type {
  BlockStatusResponse,
  ReportPostRequest,
  ReportPostResponse,
} from "@/features/moderation/types";

interface ModerationApiMessages {
  reportFailed?: string;
  blockFailed?: string;
  unblockFailed?: string;
  blockStatusFailed?: string;
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error || fallback;
}

export async function reportPostAPI(
  request: ReportPostRequest,
  messages?: ModerationApiMessages
): Promise<ReportPostResponse> {
  const response = await fetch("/api/reports/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, messages?.reportFailed || "通報に失敗しました")
    );
  }

  return response.json();
}

export async function blockUserAPI(
  userId: string,
  messages?: ModerationApiMessages
): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}/block`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, messages?.blockFailed || "ブロックに失敗しました")
    );
  }
}

export async function unblockUserAPI(
  userId: string,
  messages?: ModerationApiMessages
): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(userId)}/block`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        messages?.unblockFailed || "ブロック解除に失敗しました"
      )
    );
  }
}

export async function getBlockStatusAPI(
  userId: string,
  messages?: ModerationApiMessages
): Promise<BlockStatusResponse> {
  const response = await fetch(
    `/api/users/${encodeURIComponent(userId)}/block-status`
  );

  if (!response.ok) {
    if (response.status === 401) {
      return { isBlocked: false, isBlockedBy: false };
    }
    throw new Error(
      await readErrorMessage(
        response,
        messages?.blockStatusFailed || "ブロック状態の取得に失敗しました"
      )
    );
  }

  return response.json();
}
