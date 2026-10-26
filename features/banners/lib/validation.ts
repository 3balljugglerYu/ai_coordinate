/**
 * バナー用バリデーション
 * link_url の安全なプロトコル検証（javascript: 等の Stored XSS 防止・よそのサイトへ移すパスも断る）
 */
import { toSafeLinkUrl } from "@/lib/security/safe-link-url";

/** link_url が https:// の URL か、このサイトの中のパスか検証（toSafeLinkUrl と同じ決まり） */
export function isValidLinkUrl(url: string): boolean {
  return toSafeLinkUrl(url) !== null;
}
