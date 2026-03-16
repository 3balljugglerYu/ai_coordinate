export type PendingHomePostRefresh =
  | {
      action: "posted";
      bonusGranted?: number;
      postId: string;
    }
  | {
      action: "unposted";
      postId?: string;
    };

const HOME_POST_REFRESH_STORAGE_KEY = "persta:home-post-refresh";

function clearPendingHomePostRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(HOME_POST_REFRESH_STORAGE_KEY);
  } catch {
    // ストレージが使えない環境では何もしない
  }
}

export function persistPendingHomePostRefresh(
  payload: PendingHomePostRefresh
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      HOME_POST_REFRESH_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // セッションストレージが使えない環境では、即時反映を諦めて通常遷移する
  }
}

export function consumePendingHomePostRefresh(): PendingHomePostRefresh | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(HOME_POST_REFRESH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    clearPendingHomePostRefresh();
    const parsed = JSON.parse(raw) as Partial<PendingHomePostRefresh>;

    if (parsed?.action === "posted") {
      if (typeof parsed.postId !== "string" || parsed.postId.length === 0) {
        return null;
      }

      return {
        action: "posted",
        postId: parsed.postId,
        bonusGranted:
          typeof parsed.bonusGranted === "number"
            ? parsed.bonusGranted
            : undefined,
      };
    }

    if (parsed?.action === "unposted") {
      return {
        action: "unposted",
        postId: typeof parsed.postId === "string" ? parsed.postId : undefined,
      };
    }

    return null;
  } catch {
    clearPendingHomePostRefresh();
    return null;
  }
}
