"use client";

import { useEffect } from "react";
import { parseSignupSource } from "@/features/auth/lib/signup-source";

/** first-touch の流入元を保持する cookie 名。AuthForm の読み取りと一致させること。 */
export const SIGNUP_SOURCE_COOKIE = "persta_signup_source";

/**
 * 着地時に URL の ?signup_source=(無ければ ?utm_source=)を first-touch で cookie 保存する。
 * X 等の外部リンクがホームや /style に着地し、その後に登録しても流入元を失わないようにするための計測補助。
 * 既に cookie があれば上書きしない(初回流入を尊重)。表示は何もしない。
 */
export function SignupSourceCapture() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const source = parseSignupSource(
      params.get("signup_source") ?? params.get("utm_source")
    );
    if (!source) return;
    const exists = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`));
    if (exists) return;
    const maxAge = 60 * 60 * 24 * 30; // 30日(first-touch)
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=${encodeURIComponent(
      source
    )}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }, []);

  return null;
}
