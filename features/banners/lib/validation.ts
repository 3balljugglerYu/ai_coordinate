/**
 * バナー用バリデーション
 * link_url の安全なプロトコル検証（javascript: 等の Stored XSS 防止）
 */

/** link_url が安全なプロトコル（/ または https://）か検証 */
export function isValidLinkUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  return false;
}
