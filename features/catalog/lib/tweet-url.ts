/**
 * ツイート URL の正規化 + 検証ユーティリティ。
 * `https?://(www.|mobile.)?(x.com|twitter.com)/<handle>/status/<numeric-id>` を許容する。
 */

const HOST_PATTERN = /^(?:www\.|mobile\.)?(x\.com|twitter\.com)$/i;
const PATH_PATTERN = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,30})/;

export interface ParsedTweetUrl {
  /** 正規化された URL (https://x.com/<handle>/status/<id>) */
  normalized: string;
  handle: string;
  statusId: string;
}

/**
 * 入力 URL をパースして、正規化された X ツイート URL を返す。
 * 不正な URL なら null。
 */
export function parseTweetUrl(input: string | null | undefined): ParsedTweetUrl | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOST_PATTERN.test(url.hostname)) return null;

  const match = url.pathname.match(PATH_PATTERN);
  if (!match) return null;

  const handle = match[1];
  const statusId = match[2];

  return {
    normalized: `https://x.com/${handle}/status/${statusId}`,
    handle,
    statusId,
  };
}

/**
 * X アカウント URL を正規化する。
 * 例: https://twitter.com/handle?lang=ja → https://x.com/handle
 */
export function parseXAccountUrl(input: string | null | undefined): {
  normalized: string;
  handle: string;
} | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOST_PATTERN.test(url.hostname)) return null;

  const handleMatch = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
  if (!handleMatch) return null;

  return {
    normalized: `https://x.com/${handleMatch[1]}`,
    handle: handleMatch[1],
  };
}
