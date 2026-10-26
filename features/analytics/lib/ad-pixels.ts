/**
 * 広告の計測タグ(Pixel)の設定。
 *
 * ⚠️ 送り先を足したり、送る出来事を増やしたりしたときは、
 *    「利用者情報の外部送信について」(app/(marketing)/external-transmission/page.tsx)と
 *    プライバシーポリシーの5章も直すこと。
 * ID は外から見えてもよい値(ページの中に書かれて配られる)なので、コードに置く。
 */

import { stripLocalePrefix } from "@/i18n/config";

/** X の広告の Pixel の ID(X 広告のイベントマネージャー)。 */
export const X_PIXEL_ID = "r9ypz";

/**
 * uwt.js が自動で行う計測のうち、止めるもの(`twq('set', <名前>, 'false', <ID>)`)。
 * uwt.js(2026-10-26 に読んだもの)の中の名前。
 * - autoConfig: ボタンを押したときに、ボタンの文字(200文字まで)を送る
 * - autoAdvancedMatching: フォームのメールアドレス・電話番号・名前の欄を読み取って送る
 * - dataLayerTracking: GA4 の記録(window.dataLayer)を読み取って、X にも送る
 * - autoDwellTracking: ページにいた時間を送る
 * ⚠️ ページを離れたとき・ほかのタブやアプリへ切り替えたときの出来事(auto_page_leave)は、
 *    止める設定が無い。送る URL は toXPageLocation で決めたものに置き換えるので、
 *    そのときのページの場所(? や # のうしろは無し)が送られる。
 */
export const X_PIXEL_DISABLED_AUTO_FEATURES = [
  "autoConfig",
  "autoAdvancedMatching",
  "dataLayerTracking",
  "autoDwellTracking",
] as const;

/** 本番のサイトだけで読み込む(開発・プレビューで広告の数字を汚さない)。 */
const AD_PIXEL_HOSTS = new Set(["www.persta.ai", "persta.ai"]);

export function isAdPixelHost(hostname: string): boolean {
  return AD_PIXEL_HOSTS.has(hostname.toLowerCase());
}

/**
 * 開いたときに Pixel を読み込まないページ。
 * - 管理画面
 * - ログイン・登録・パスワードの再設定・ログインの途中(URL に戻り先や一度だけ使う認証のコードが付く)
 * - 検索(URL に、利用者が打った語句が付く)
 * 先頭の言語(/ja など)は外して比べる。
 */
const EXCLUDED_PATH_PREFIXES = ["/admin", "/auth", "/login", "/signup", "/reset-password", "/account", "/search"];

export function isAdPixelExcludedPath(pathname: string): boolean {
  const withoutLocale = stripLocalePrefix(pathname).pathname;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => withoutLocale === prefix || withoutLocale.startsWith(`${prefix}/`),
  );
}

/**
 * X に送るページの URL(uwt.js の page_location)。
 *
 * uwt.js は、page_location が決まっていると、送るたびに
 * 「ページの URL」と「来る前のページの URL」の両方をこの値に置き換える(2026-10-26 に読んだ uwt.js)。
 * - ドメインとページの場所だけにする(? や # のうしろの、検索の語句・ログインのコード・トークンは送らない)。
 * - 読み込まないページ(管理画面など)は、ページの場所も送らず、サイトの最初のページにする。
 * 広告から来たかの印(twclid)は、uwt.js が本当の URL から別に読むので、置き換えても消えない。
 */
export function toXPageLocation(origin: string, pathname: string): string {
  if (isAdPixelExcludedPath(pathname)) {
    return `${origin}/`;
  }
  return `${origin}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
