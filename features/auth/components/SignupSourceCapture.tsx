"use client";

import { useEffect } from "react";
import { parseSignupSource } from "@/features/auth/lib/signup-source";

/** first-touch の流入元を保持する cookie 名。AuthForm の読み取りと一致させること。 */
export const SIGNUP_SOURCE_COOKIE = "persta_signup_source";

/**
 * 着地時に URL の ?signup_source=(無ければ ?utm_source=)を first-touch で cookie 保存する。
 * X 等の外部リンクがホームや /style に着地し、その後に登録しても流入元を失わないようにするための計測補助。
 * 既に cookie があれば上書きしない(初回流入を尊重)。表示は何もしない。
 *
 * ## fallbackSource
 *
 * 企画ページのように「そこに着地した時点で流入元が確定している」画面で、
 * URL にタグが無いときの既定値を渡す。
 *
 * これが無いと、**運営が X に投稿するリンクへ毎回手でタグを付けない限り
 * 何も記録されない**。実際 `profiles.signup_source` は全期間で style/wardrobe の
 * 8件しか無く、企画キーは1件も記録されていなかった(仕組みは動いていたが、
 * タグの付いた URL がほとんど存在しなかった)。
 *
 * URL の明示指定があればそちらを優先する。AppShell の常駐インスタンスと
 * 同時に走っても、どちらの順序でも同じ値になる(両方が同じ URL を見て、
 * 先に cookie を書いた方が勝ち、後発は既存 cookie を尊重して何もしない)。
 */
export function SignupSourceCapture({
  fallbackSource,
}: {
  fallbackSource?: string | null;
} = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const source =
      parseSignupSource(
        params.get("signup_source") ?? params.get("utm_source")
      ) ?? parseSignupSource(fallbackSource);
    if (!source) return;
    const exists = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`));
    if (exists) return;
    const maxAge = 60 * 60 * 24 * 30; // 30日(first-touch)
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=${encodeURIComponent(
      source
    )}; path=/; max-age=${maxAge}; SameSite=Lax`;
    // 再実行されても cookie 既存で即 return するため、副作用は起きない。
  }, [fallbackSource]);

  return null;
}
