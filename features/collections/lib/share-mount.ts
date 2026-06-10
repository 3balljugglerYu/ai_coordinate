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
 * 台紙の公開ページURL(/m/{completionId}?v={ts})を組み立てる(client 用)。
 *
 * mountImageUrl を渡すと、台紙更新ごとに ?v=...が付き、SNS(X/Facebook 等)の
 * カードキャッシュが新しい URL として扱われ即時に新しい OGP が反映される。
 * 引数省略時はバージョン無しの旧形式 URL を出す(後方互換)。
 */
export function buildPublicMountUrl(
  completionId: string,
  mountImageUrl?: string | null,
): string {
  const version = extractMountVersionFromUrl(mountImageUrl);
  const path = version
    ? `/m/${completionId}?v=${version}`
    : `/m/${completionId}`;
  return `${window.location.origin}${path}`;
}

/**
 * mount_shared を記録する(best-effort)。失敗は握りつぶす。
 * 共有/コピーの成功時(ShareLinkButton の onShared)から呼ぶ。
 */
export function trackMountShareEvent(completionId: string): void {
  void fetch("/api/collections/share-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completionId }),
  }).catch(() => {});
}
