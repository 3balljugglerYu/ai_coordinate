/**
 * 広告の計測タグ(Pixel)の設定。
 *
 * ⚠️ 送り先を足したり、送る出来事を増やしたりしたときは、
 *    「利用者情報の外部送信について」(app/(marketing)/external-transmission/page.tsx)と
 *    プライバシーポリシーの5章も直すこと。
 * ID は外から見えてもよい値(ページの中に書かれて配られる)なので、コードに置く。
 */

import { locales } from "@/i18n/config";

/** X の広告の Pixel の ID(X 広告のイベントマネージャー)。 */
export const X_PIXEL_ID = "r9ypz";

/** 本番のサイトだけで読み込む(開発・プレビューで広告の数字を汚さない)。 */
const AD_PIXEL_HOSTS = new Set(["www.persta.ai", "persta.ai"]);

export function isAdPixelHost(hostname: string): boolean {
  return AD_PIXEL_HOSTS.has(hostname.toLowerCase());
}

/**
 * 広告の送り先に知らせなくてよいページ(管理画面・ログインの途中)。
 * 先頭の言語(/ja など)は外して比べる。
 */
const EXCLUDED_PATH_PREFIXES = ["/admin", "/auth"];

export function isAdPixelExcludedPath(pathname: string): boolean {
  const [, first = ""] = pathname.split("/");
  const withoutLocale = (locales as readonly string[]).includes(first)
    ? pathname.slice(first.length + 1) || "/"
    : pathname;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => withoutLocale === prefix || withoutLocale.startsWith(`${prefix}/`),
  );
}
