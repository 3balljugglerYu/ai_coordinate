"use client";

import { useEffect } from "react";
import { useAdPixelGate } from "@/features/analytics/hooks/use-ad-pixel-gate";
import { isMetaPixelExcludedPath, isMetaPixelExcludedReferrer, META_PIXEL_ID } from "@/features/analytics/lib/ad-pixels";
import { AD_SIGNUP_META_COOKIE, AD_SIGNUP_META_COOKIE_DELETE } from "@/features/analytics/lib/ad-signup-signal";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: Fbq;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
};

/**
 * このタブでの Meta Pixel の状態(window に置く。部品の作り直し・同じ部品が2回読み込まれても1つ)。
 * - loading: fbevents.js を取りに行っている(届いたら、その時点のページで init と「ページを見た」)
 * - ready: init 済み(ページを移るたびに「ページを見た」を送る)
 */
type MetaPixelState = { phase: "loading" | "ready"; signupSent: boolean };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
    __perstaMetaPixel?: MetaPixelState;
  }
}

export const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/** 今のページで送ってよいか(送るその時点の URL で確かめる)。 */
function isCurrentPageAllowed(): boolean {
  return !isMetaPixelExcludedPath(window.location.pathname);
}

function hasSignupCookie(): boolean {
  return document.cookie.split("; ").includes(`${AD_SIGNUP_META_COOKIE}=1`);
}

/**
 * Meta の公式の読み込みの文と同じ fbq を置き、fbevents.js を取りに行く。
 * ⭐ 何も積まずに取りに行く。積んだものは、fbevents.js が届いたときの URL で送られるので、
 *    届くまでのあいだに動かさないページへ移ると、その URL が送られてしまう。届いてから確かめて積む。
 */
function installFbq(onLoad: () => void): void {
  const fbq: Fbq = (...args: unknown[]) => {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue?.push(args);
    }
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  // fbevents.js は、届いたときにこの値を読む(先に置いておく)
  fbq.disablePushState = true;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = META_PIXEL_SCRIPT_SRC;
  script.onload = onLoad;
  document.head.appendChild(script);
}

/**
 * 自動の計測を止めてから init する。
 * - fbq.disablePushState: 画面の中でページを移るたびに、fbevents.js が自分で「ページを見た」を送る
 *   (history.pushState を差し替える)のを止める。送るのは、ここで決めたページだけにするため。
 * - autoConfig: ボタンを押したときの出来事(inferredevents)と、ページの中の情報(microdata)を送るのを止める。
 */
function initFbq(fbq: Fbq, state: MetaPixelState) {
  fbq.disablePushState = true;
  fbq("set", "autoConfig", false, META_PIXEL_ID);
  fbq("init", META_PIXEL_ID);
  state.phase = "ready";
}

/**
 * 「ページを見た」を送る。登録が終わったあと(AD_SIGNUP_META_COOKIE があるとき)は、続けて
 * 「登録した」(CompleteRegistration)を、このタブで1回だけ送る。
 * 印は、fbevents.js が届いたあとに消す(届く前に消すと、広告を止める拡張機能などで届かなかったときに、
 * 送れないまま印が無くなる)。
 */
function sendPageView(fbq: Fbq, state: MetaPixelState) {
  fbq("track", "PageView");
  if (!state.signupSent && hasSignupCookie()) {
    state.signupSent = true;
    fbq("track", "CompleteRegistration");
    document.cookie = AD_SIGNUP_META_COOKIE_DELETE;
  }
}

/** 今のページで「ページを見た」を送る(初めてのときは、fbevents.js が届いてから)。 */
export function trackMetaPixelPageView() {
  const state = window.__perstaMetaPixel;
  if (state?.phase === "ready" && window.fbq) {
    sendPageView(window.fbq, state);
    return;
  }
  // 取りに行っている途中なら、届いたときに、その時点のページで送る
  if (state) return;

  const next: MetaPixelState = { phase: "loading", signupSent: false };
  window.__perstaMetaPixel = next;
  // ほかに fbq を置いたものがあるときは、それを使う(fbevents.js を2回取りに行かない)
  if (window.fbq) {
    initFbq(window.fbq, next);
    sendPageView(window.fbq, next);
    return;
  }
  installFbq(() => {
    const fbq = window.fbq;
    if (!fbq) return;
    initFbq(fbq, next);
    if (isCurrentPageAllowed()) sendPageView(fbq, next);
  });
}

/**
 * Meta の広告の Pixel(広告から来た人が、サイトを訪れたか・登録したかを測る)。
 *
 * 開いたページの URL は、そのまま Meta に送られる(fbevents.js は URL を差し替えられない・ad-pixels.ts)。
 * 本番のサイトで、動かさないページ(isMetaPixelExcludedPath)以外を開いたとき・移ったとき(pathname が
 * 変わったとき。? のうしろだけが変わったときは送らない)に、「ページを見た」を送る。
 * - 動かさないページ(ログインの完了の画面など)から始めたときは、ほかのページへ移ったときに初めて読み込む。
 *   ただし管理画面から開いたタブでは、ほかのページへ移っても読み込まない(useAdPixelGate)。
 * - 来る前のページが、このサイトの動かさないページのとき(検索の結果を新しいタブで開いたときなど)は、
 *   そのタブでは読み込まない(来る前のページの URL もそのまま送られるため)。
 * ⚠️ fbevents.js は Meta の CDN から最新を読み込む(版を固定できない)。uwt.js と同じく、
 *    数か月に1度は読み直して、名前と送る項目が変わっていないかを確かめること。
 */
export function MetaPixelScript() {
  const { enabled, pathname } = useAdPixelGate();

  useEffect(() => {
    if (!enabled || isMetaPixelExcludedPath(pathname)) return;
    if (isMetaPixelExcludedReferrer(document.referrer, window.location.origin)) return;
    trackMetaPixelPageView();
  }, [enabled, pathname]);

  return null;
}
