import { stripLocalePrefix } from "@/i18n/config";

/**
 * 広告の計測タグ(Pixel)の設定。
 *
 * ⚠️ 送り先を足したり、送る出来事を増やしたりしたときは、
 *    「利用者情報の外部送信について」(app/(marketing)/external-transmission/page.tsx)と
 *    プライバシーポリシーの5章も直すこと。
 * ID は外から見えてもよい値(ページの中に書かれて配られる)なので、コードに置く。
 */

/** X の広告の Pixel の ID(X 広告のイベントマネージャー)。 */
export const X_PIXEL_ID = "r9ypz";

/**
 * uwt.js が自動で行う計測のうち、止めるもの(`twq('set', <名前>, 'false', <ID>)`)。
 * uwt.js(2026-10-26 に読んだもの)の中の名前。
 * - autoConfig: ボタンを押したときに、ボタンの文字(200文字まで)を送る
 * - autoAdvancedMatching: フォームのメールアドレス・電話番号・名前の欄を読み取って送る
 * - dataLayerTracking: GA4 の記録(window.dataLayer)を読み取って、X にも送る
 * - autoDwellTracking: ページにいた時間を送る。これを止めると、ページを離れたとき・
 *   ほかのタブへ切り替えたときの出来事(auto_page_leave)も送られなくなる(同じ止め方を見ている)
 * 4つとも止めると、送るのは config のときの「ページを見た」1回だけになる。
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

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  const withoutLocale = stripLocalePrefix(pathname).pathname;
  return prefixes.some(
    (prefix) => withoutLocale === prefix || withoutLocale.startsWith(`${prefix}/`),
  );
}

/** 開いたときに Pixel を読み込まないページ(管理画面。広告から来る人はいない)。 */
export function isAdPixelExcludedPath(pathname: string): boolean {
  return matchesPrefix(pathname, ["/admin"]);
}

/**
 * ページの場所を X に送ってよいページ(だれでも見られる、案内・企画・カタログのページ)。
 * ⭐ ここに無いページ(投稿・プロフィール・共有・ログイン・検索・新しく作ったページなど)は、
 *    URL を送らない。場所そのものに ID や共有のコードが入るページがあるため、
 *    送ってよいページを並べる形にしている(足し忘れても、送らない側に倒れる)。
 */
const SHAREABLE_PATH_PREFIXES = [
  "/style",
  "/free",
  "/campaigns",
  "/collections",
  "/catalog",
  "/styles",
  "/user-styles",
  "/guide",
  "/pricing",
  "/about",
  "/tools",
  "/creator-rewards",
  "/collab",
] as const;

export function isAdPixelShareablePath(pathname: string): boolean {
  return stripLocalePrefix(pathname).pathname === "/" || matchesPrefix(pathname, SHAREABLE_PATH_PREFIXES);
}

/**
 * X に送るページの URL の決まり(uwt.js の page_location / hide_page_location)。
 *
 * uwt.js は、これが決まっていると、送るときに「ページの URL」と「来る前のページの URL」の
 * 両方をこの値に置き換える(hide_page_location のときは両方とも空)(2026-10-26 に読んだ uwt.js)。
 * - 送ってよいページは、ドメインとページの場所だけ(? や # のうしろは送らない)。
 * - それ以外のページは、URL を送らない。
 * 広告から来たかの印(twclid)は、uwt.js が本当の URL から別に読むので、どちらでも消えない。
 */
export function toXPageLocationParams(
  origin: string,
  pathname: string,
): { page_location: string } | { hide_page_location: true } {
  if (!isAdPixelShareablePath(pathname)) {
    return { hide_page_location: true };
  }
  return { page_location: `${origin}${pathname.startsWith("/") ? pathname : `/${pathname}`}` };
}
