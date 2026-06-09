import { sharePost } from "@/lib/share-post";

/**
 * 台紙ストレージURLから「mount-{timestamp}」のタイムスタンプ部分だけ抜く。
 * 古い台紙(タイムスタンプ前の固定パス)は null を返す。
 *
 * 例: ".../mount-1717999999999.png?v=..." → "1717999999999"
 */
export function extractMountVersionFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/mount-(\d+)\.png/);
  return m ? m[1] : null;
}

/**
 * 台紙の公開ページURL(/m/{completionId}?v={ts})を Web Share / クリップボードで共有し、
 * 成功したら mount_shared を記録する(client 用)。
 *
 * mountImageUrl を渡すと、台紙更新ごとに ?v=...が付き、SNS(X/Facebook 等)の
 * カードキャッシュが新しい URL として扱われ即時に新しい OGP が反映される。
 * 引数省略時はバージョン無しの旧形式 URL を出す(後方互換)。
 *
 * ユーザーがキャンセルした場合は sharePost が AbortError を throw するので、
 * 呼び出し側で握りつぶす。
 */
export async function shareMount(
  completionId: string,
  mountImageUrl?: string | null,
): Promise<void> {
  const version = extractMountVersionFromUrl(mountImageUrl);
  const path = version
    ? `/m/${completionId}?v=${version}`
    : `/m/${completionId}`;
  const url = `${window.location.origin}${path}`;
  await sharePost(url);
  // 共有成功時のみ計測(best-effort)
  void fetch("/api/collections/share-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completionId }),
  }).catch(() => {});
}
