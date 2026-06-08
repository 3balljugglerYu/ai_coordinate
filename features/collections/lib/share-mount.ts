import { sharePost } from "@/lib/share-post";

/**
 * 台紙の公開ページURL(/m/{completionId})を Web Share / クリップボードで共有し、
 * 成功したら mount_shared を記録する(client 用)。
 * ユーザーがキャンセルした場合は sharePost が AbortError を throw するので、
 * 呼び出し側で握りつぶす。
 */
export async function shareMount(completionId: string): Promise<void> {
  const url = `${window.location.origin}/m/${completionId}`;
  await sharePost(url);
  // 共有成功時のみ計測(best-effort)
  void fetch("/api/collections/share-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completionId }),
  }).catch(() => {});
}
