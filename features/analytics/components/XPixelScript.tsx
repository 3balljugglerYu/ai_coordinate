"use client";

import { useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  isAdPixelExcludedPath,
  isAdPixelHost,
  X_PIXEL_DISABLED_AUTO_FEATURES,
  X_PIXEL_ID,
} from "@/features/analytics/lib/ad-pixels";

/**
 * X の広告の Pixel(広告から来た人が、サイトを訪れたかを測る)。
 *
 * - 本番のサイト(www.persta.ai)だけで読み込む。
 * - 管理画面・ログインまわり・検索のページから開いたときは読み込まない。
 * - 自動の計測(ボタンの文字・フォームの欄・GA4 の記録の転送・いた時間)は、config より前に止める。
 * - 送るのは、読み込んだときの「ページを見た」と、uwt.js が止められない「ページを離れた」だけ。
 */
const subscribeNothing = () => () => {};

export function XPixelScript() {
  const pathname = usePathname();
  // サーバーでは false(本番かどうかは、ブラウザの URL でしか分からない)
  const isProductionHost = useSyncExternalStore(
    subscribeNothing,
    () => isAdPixelHost(window.location.hostname),
    () => false,
  );

  // 外すページへ移っても、読み込んだものは残る(next/script は同じ id を2回動かさない)
  if (!isProductionHost || isAdPixelExcludedPath(pathname ?? "/")) {
    return null;
  }

  // X の公式の読み込み方(uwt.js が読み終わるまでは、呼び出しを並べておく)
  return (
    <Script id="x-pixel" strategy="afterInteractive">
      {`
        !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
        },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
        a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
        ${X_PIXEL_DISABLED_AUTO_FEATURES.map((name) => `twq('set','${name}','false','${X_PIXEL_ID}');`).join("\n        ")}
        twq('config','${X_PIXEL_ID}');
      `}
    </Script>
  );
}
