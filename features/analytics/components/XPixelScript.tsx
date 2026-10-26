"use client";

import { useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  isAdPixelExcludedPath,
  isAdPixelHost,
  toXPageLocationParams,
  X_PIXEL_DISABLED_AUTO_FEATURES,
  X_PIXEL_ID,
} from "@/features/analytics/lib/ad-pixels";

/**
 * X の広告の Pixel(広告から来た人が、サイトを訪れたかを測る)。
 *
 * - 本番のサイト(www.persta.ai)だけで読み込む。
 * - 管理画面から開いたときは、そのあとほかのページへ移っても読み込まない
 *   (「ページを読み込んだときだけ送る」を守るため)。ほかのページは、広告の行き先になりうるので読み込む
 *   (読み込まないと、広告から来た印 twclid を受け取れない)。
 * - 自動の計測(ボタンの文字・フォームの欄・GA4 の記録の転送・いた時間と離れたとき)は、config より前に止める。
 * - 送る URL は toXPageLocationParams で決める(送ってよいページは、ドメインとページの場所だけ。
 *   ほかのページは送らない)。
 * - 送るのは、読み込んだときの「ページを見た」1回だけ(画面の中でページを移っても送らない)。
 */
const subscribeNothing = () => () => {};

/** <script> の中に埋める JSON。URL に </script> などが入っても、タグを閉じさせない。 */
function toInlineScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function XPixelScript() {
  const pathname = usePathname() ?? "/";
  // 最初に開いたページ(画面の中で移っても変わらない)
  const [openedOnExcludedPath] = useState(() => isAdPixelExcludedPath(pathname));
  // サーバーでは false(本番かどうかは、ブラウザの URL でしか分からない)
  const isProductionHost = useSyncExternalStore(
    subscribeNothing,
    () => isAdPixelHost(window.location.hostname),
    () => false,
  );

  // next/script は同じ id を2回動かさないので、config(「ページを見た」)は最初の1回だけ
  if (!isProductionHost || openedOnExcludedPath) {
    return null;
  }

  const pageLocationParams = toXPageLocationParams(window.location.origin, pathname);

  // X の公式の読み込み方(uwt.js が読み終わるまでは、呼び出しを並べておく)
  return (
    <Script id="x-pixel" strategy="afterInteractive">
      {`
        !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
        },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
        a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
        ${X_PIXEL_DISABLED_AUTO_FEATURES.map((name) => `twq('set','${name}','false','${X_PIXEL_ID}');`).join("\n        ")}
        twq('set',${toInlineScriptJson(pageLocationParams)});
        twq('config','${X_PIXEL_ID}');
      `}
    </Script>
  );
}
