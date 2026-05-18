/**
 * Cloudflare Turnstile のサーバー側検証ヘルパ。
 * 投稿 API で必ず呼び、bot 対策を施す (ADR-004)。
 */

import { env } from "@/lib/env";

const TURNSTILE_VERIFY_ENDPOINT =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerifyResult =
  | { success: true }
  | { success: false; reason: "missing_secret" | "missing_token" | "rejected" };

/**
 * Turnstile トークンをサーバ側で検証する。
 *
 * - `TURNSTILE_SECRET_KEY` が未設定なら "missing_secret" を返す (開発環境の fail-open は呼出側で判断)。
 * - 検証エンドポイントが 200 を返し success=true なら通過。
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { success: false, reason: "missing_secret" };
  }
  if (!token || token.length === 0) {
    return { success: false, reason: "missing_token" };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      return { success: false, reason: "rejected" };
    }
    const json = (await response.json()) as { success?: boolean };
    if (json?.success === true) {
      return { success: true };
    }
    return { success: false, reason: "rejected" };
  } catch (err) {
    console.error("[turnstile] verify request failed", err);
    return { success: false, reason: "rejected" };
  }
}
