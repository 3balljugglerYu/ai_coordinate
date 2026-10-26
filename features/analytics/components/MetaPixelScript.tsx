"use client";

import { useEffect } from "react";
import { useAdPixelGate } from "@/features/analytics/hooks/use-ad-pixel-gate";
import { isMetaPixelExcludedPath, META_PIXEL_ID } from "@/features/analytics/lib/ad-pixels";
import { AD_SIGNUP_META_COOKIE, AD_SIGNUP_META_COOKIE_DELETE } from "@/features/analytics/lib/ad-signup-signal";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: Fbq;
  loaded?: boolean;
  version?: string;
  disablePushState?: boolean;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const META_PIXEL_SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

let initialized = false;

/** テストで、ページを開き直したことにする。 */
export function resetMetaPixelForTest() {
  initialized = false;
}

/**
 * Meta の公式の読み込みの文と同じことをする(fbq を先に置き、fbevents.js を取りに行く)。
 * fbevents.js が届くまでは、fbq に積んだものが待たされ、届いたあとに送られる。
 */
function installFbq(): Fbq {
  if (window.fbq) return window.fbq;
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
  document.head.appendChild(script);
  return fbq;
}

/**
 * 「ページを見た」を送る。初めてのときは、先に自動の計測を止めてから init する。
 * - fbq.disablePushState: 画面の中でページを移るたびに、fbevents.js が自分で「ページを見た」を送る
 *   (history.pushState を差し替える)のを止める。送るのは、ここで決めたページだけにするため。
 * - autoConfig: ボタンを押したときの出来事(inferredevents)と、ページの中の情報(microdata)を送るのを止める。
 * 登録が終わったあと(AD_SIGNUP_META_COOKIE があるとき)は、続けて「登録した」(CompleteRegistration)を1回送る。
 */
export function trackMetaPixelPageView() {
  const fbq = installFbq();
  if (!initialized) {
    initialized = true;
    fbq.disablePushState = true;
    fbq("set", "autoConfig", false, META_PIXEL_ID);
    fbq("init", META_PIXEL_ID);
  }
  fbq("track", "PageView");
  if (document.cookie.split("; ").includes(`${AD_SIGNUP_META_COOKIE}=1`)) {
    // ほかのタブで2回送らないように、先に印を消す
    document.cookie = AD_SIGNUP_META_COOKIE_DELETE;
    fbq("track", "CompleteRegistration");
  }
}

/**
 * Meta の広告の Pixel(広告から来た人が、サイトを訪れたか・登録したかを測る)。
 *
 * 開いたページの URL は、そのまま Meta に送られる(fbevents.js は URL を差し替えられない・ad-pixels.ts)。
 * 本番のサイトで、動かさないページ(isMetaPixelExcludedPath)以外を開いたとき・移ったときに、「ページを見た」を送る。
 * 動かさないページから始めたときは、ほかのページへ移ったときに初めて読み込む。
 * ⚠️ fbevents.js は Meta の CDN から最新を読み込む(版を固定できない)。uwt.js と同じく、
 *    数か月に1度は読み直して、名前と送る項目が変わっていないかを確かめること。
 */
export function MetaPixelScript() {
  const { enabled, pathname } = useAdPixelGate();

  useEffect(() => {
    if (!enabled || isMetaPixelExcludedPath(pathname)) return;
    trackMetaPixelPageView();
  }, [enabled, pathname]);

  return null;
}
