/**
 * Bearer 認証(モバイルアプリ用)の共通ヘルパー。
 *
 * ブラウザは Supabase のセッション Cookie で認証する(従来どおり・無変更)。
 * ネイティブアプリは Cookie を持てないため、Supabase のアクセストークン(JWT)を
 * `Authorization: Bearer <access_token>` で送る。ここはそのヘッダーを読み取る
 * 純粋関数だけを置き、proxy / Route Handler / テストから共有する。
 *
 * 設計: docs/planning/flutter-app-parity-implementation-plan.md ADR-001 / Phase 1
 *
 * ⚠️ Bearer 秘密鍵(`/api/internal/*` の CRON_SECRET 等)も同じヘッダー名を使う。
 * JWT の形をしていないトークンは「アプリのセッションではない」と判定して無視し、
 * 既存の秘密鍵ルートの挙動を変えない。
 */

/** `header.payload.signature` の 3 区画(base64url)。Supabase のアクセストークンはこの形。 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * `Authorization: Bearer <token>` のトークン部分を返す。
 * - ヘッダー無し / スキームが Bearer でない / 空 → null
 * - スキームは大文字小文字を区別しない(RFC 6750 §2.1)
 */
export function readBearerToken(headers: HeaderReader): string | null {
  const raw = headers.get("authorization");
  if (!raw) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Supabase のアクセストークンとして扱ってよい Bearer トークン(JWT の形)だけを返す。
 * 秘密鍵など JWT でない値は null(= Cookie 経路にフォールバックする)。
 */
export function readBearerJwt(headers: HeaderReader): string | null {
  const token = readBearerToken(headers);
  if (!token || !JWT_SHAPE.test(token)) {
    return null;
  }
  return token;
}

function decodeBase64Url(segment: string): string | null {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(padded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * JWT の `exp`(秒)を署名検証なしで読む。期限切れトークンで無駄な
 * リフレッシュ通信をしないための事前判定にだけ使い、認可には使わない
 * (本人確認は常に Supabase Auth の `getUser` で行う)。
 */
export function decodeJwtExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const json = decodeBase64Url(parts[1]);
  if (json === null) {
    return null;
  }
  try {
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp
      : null;
  } catch {
    return null;
  }
}

/**
 * まだ有効期限内か。`exp` が読めないトークンは無効扱い(安全側)。
 */
export function isJwtUnexpired(
  token: string,
  nowSeconds: number = Date.now() / 1000
): boolean {
  const exp = decodeJwtExpiry(token);
  return exp !== null && exp > nowSeconds;
}
