import "server-only";

import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * 未ログインユーザーを長期に追跡する Cookie 名。
 * 生成画面（/style, /coordinate）のレート制限で IP と組み合わせて識別子を作る。
 */
export const GUEST_ID_COOKIE = "persta_guest_id";

/**
 * Cookie の有効期限（1 年）。
 * Cookie が削除されると識別ハッシュが変わるため当日カウントは引き継がれない（ADR-009 参照）。
 * 1 年は「同一ブラウザの同一ユーザー」を実用上ほぼ追跡できる長さ。
 */
export const GUEST_ID_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * RFC 4122 準拠の UUID（v1〜v5）にマッチする緩い検証。
 * 厳密に v4 のみへ絞らないのは、将来 v7 への切替時に Cookie 失効の必要を生まないため。
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Cookie 値として妥当な UUID 文字列か判定する。
 * 妥当でなければ proxy 側で再発行する想定。
 */
export function isValidGuestId(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * リクエストから既存のゲスト Cookie 値を読み出す。
 * - 存在しない / 形式不正 → null
 *
 * 取得は副作用なし。発行は `ensureGuestIdOnResponse()` を使う。
 */
export function readGuestIdCookie(request: NextRequest): string | null {
  const raw = request.cookies.get(GUEST_ID_COOKIE)?.value;
  return isValidGuestId(raw) ? raw : null;
}

/**
 * proxy（middleware）で `/style` と `/coordinate` 配下のリクエストに対して
 * Cookie が無い／壊れていれば新規発行してレスポンスにセットする。
 *
 * - 既に妥当な値があれば触らない（同一識別子を維持する）
 * - 不正値の場合は再発行（レート制限の抜け道を作らないため）
 *
 * Returns the effective guest id (either the existing valid one or the newly issued one).
 */
export function ensureGuestIdOnResponse(
  request: NextRequest,
  response: NextResponse
): string {
  const existing = readGuestIdCookie(request);
  if (existing) {
    return existing;
  }

  const next = randomUUID();
  response.cookies.set({
    name: GUEST_ID_COOKIE,
    value: next,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_ID_COOKIE_MAX_AGE,
    // 本番 (HTTPS) では Secure を必須にする。
    // ローカル http 開発では Secure を外して Cookie を保存できるようにする。
    secure: process.env.NODE_ENV === "production",
  });
  return next;
}

/**
 * Cookie 発行を必要とするパスかどうかを判定する。
 * ゲスト生成が動く `/style` と `/coordinate` 配下のみで発行する（ロケールプレフィックス付きも考慮）。
 *
 * 例:
 *  - `/style`, `/style/...` → true
 *  - `/coordinate`, `/coordinate/...` → true
 *  - `/en/style`, `/ja/coordinate/foo` → true
 *  - `/posts/123`, `/api/...` → false
 */
export function shouldIssueGuestIdForPathname(pathname: string): boolean {
  return GUEST_ID_PATHNAME_PATTERN.test(pathname);
}

const GUEST_ID_PATHNAME_PATTERN =
  /^\/(?:[a-z]{2}\/)?(?:style|coordinate)(?:\/|$)/i;
