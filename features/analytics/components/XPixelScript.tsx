"use client";

import { useEffect, useSyncExternalStore } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  isAdPixelExcludedPath,
  isAdPixelHost,
  toXPageLocation,
  X_PIXEL_DISABLED_AUTO_FEATURES,
  X_PIXEL_ID,
} from "@/features/analytics/lib/ad-pixels";

declare global {
  interface Window {
    twq?: (...args: unknown[]) => void;
  }
}

/**
 * X の広告の Pixel(広告から来た人が、サイトを訪れたかを測る)。
 *
 * - 本番のサイト(www.persta.ai)だけで読み込む。
 * - 管理画面・ログインまわり・検索のページから開いたときは読み込まない。
 * - 自動の計測(ボタンの文字・フォームの欄・GA4 の記録の転送・いた時間)は、config より前に止める。
 * - 送る URL は、ページを移るたびに toXPageLocation の値へ置き換える(? や # のうしろは送らない)。
 * - 送るのは、読み込んだときの「ページを見た」と、uwt.js が止められない「ページを離れた」だけ。
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
  // サーバーでは false(本番かどうかは、ブラウザの URL でしか分からない)
  const isProductionHost = useSyncExternalStore(
    subscribeNothing,
    () => isAdPixelHost(window.location.hostname),
    () => false,
  );

  // 読み込んだあと、ページを移るたびに、送る URL を置き換える(読み込む前は twq が無いので何もしない)
  useEffect(() => {
    if (!isProductionHost) return;
    window.twq?.("set", { page_location: toXPageLocation(window.location.origin, pathname) });
  }, [isProductionHost, pathname]);

  // 外すページへ移っても、読み込んだものは残る(next/script は同じ id を2回動かさない)
  if (!isProductionHost || isAdPixelExcludedPath(pathname)) {
    return null;
  }

  const pageLocation = toXPageLocation(window.location.origin, pathname);

  // X の公式の読み込み方(uwt.js が読み終わるまでは、呼び出しを並べておく)
  return (
    <Script id="x-pixel" strategy="afterInteractive">
      {`
        !function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
        },s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
        a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
        ${X_PIXEL_DISABLED_AUTO_FEATURES.map((name) => `twq('set','${name}','false','${X_PIXEL_ID}');`).join("\n        ")}
        twq('set',${toInlineScriptJson({ page_location: pageLocation })});
        twq('config','${X_PIXEL_ID}');
      `}
    </Script>
  );
}
