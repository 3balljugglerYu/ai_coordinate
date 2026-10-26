"use client";

import { useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  isAdPixelExcludedPath,
  isAdPixelHost,
  isMetaPixelLoadableLocation,
  META_PIXEL_ID,
} from "@/features/analytics/lib/ad-pixels";
import { AD_SIGNUP_META_COOKIE, AD_SIGNUP_META_COOKIE_DELETE } from "@/features/analytics/lib/ad-signup-signal";

/**
 * Meta の広告の Pixel(広告から来た人が、サイトを訪れたか・登録したかを測る)。
 *
 * - 本番のサイト(www.persta.ai)だけで読み込む。管理画面から開いたときは、そのあとも読み込まない。
 * - Meta は送る URL を差し替えられないので、今の URL が「きれい」(isMetaPixelLoadableLocation)な
 *   ページになったときに、初めて読み込む(それまでのページでは読み込まない)。
 * - 自動の計測(ボタンを押したとき・ページの中の情報・ページを移るたびの「ページを見た」)は、init より前に止める。
 * - 送るのは、読み込んだときの「ページを見た」1回と、登録が終わったあと(AD_SIGNUP_META_COOKIE があるとき)の
 *   「登録した」(CompleteRegistration)1回だけ。
 */
/*
  Meta の fbevents.js が自動で行う計測を止める呼び出し(init より前に呼ぶ)。
  - autoConfig: ボタンを押したときの出来事(inferredevents)と、ページの中の情報(microdata)を送る
  - disablePushState: 画面の中でページを移るたびに「ページを見た」を送る(history.pushState を差し替える)
  止めると、送るのは init のあとの「ページを見た」1回と、登録が終わったときの「登録した」だけになる。
  ⚠️ fbevents.js は Meta の CDN から最新を読み込む(版を固定できない)。uwt.js と同じく、
     数か月に1度は読み直して、名前と送る項目が変わっていないかを確かめること。
*/
const subscribeNothing = () => () => {};

export function MetaPixelScript() {
  const pathname = usePathname() ?? "/";
  const isProductionHost = useSyncExternalStore(
    subscribeNothing,
    () => isAdPixelHost(window.location.hostname),
    () => false,
  );
  const [openedOnExcludedPath] = useState(() => isAdPixelExcludedPath(pathname));
  // ページを移るたびに(pathname が変わるたびに描き直される)、今の URL と来る前のページを見る
  const isLoadableNow = useSyncExternalStore(
    subscribeNothing,
    () => isMetaPixelLoadableLocation(window.location.href, document.referrer),
    () => false,
  );

  // 一度読み込んだら、きれいでないページへ移っても残る(next/script は同じ id を2回動かさない)
  if (!isProductionHost || openedOnExcludedPath || !isLoadableNow) {
    return null;
  }

  // Meta の公式の読み込み方(fbevents.js が読み終わるまでは、呼び出しを並べておく)
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq.disablePushState=true;
        fbq('set','autoConfig',false,'${META_PIXEL_ID}');
        fbq('init','${META_PIXEL_ID}');
        fbq('track','PageView');
        if(document.cookie.split('; ').indexOf('${AD_SIGNUP_META_COOKIE}=1')>-1){
          fbq('track','CompleteRegistration');
          document.cookie='${AD_SIGNUP_META_COOKIE_DELETE}';
        }
      `}
    </Script>
  );
}
