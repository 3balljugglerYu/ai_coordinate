"use client";

import { useEffect } from "react";
import Script from "next/script";
import { useAdPixelGate } from "@/features/analytics/hooks/use-ad-pixel-gate";
import { META_PIXEL_ID, META_PIXEL_INLINE_RULES } from "@/features/analytics/lib/ad-pixels";
import { AD_SIGNUP_META_COOKIE, AD_SIGNUP_META_COOKIE_DELETE } from "@/features/analytics/lib/ad-signup-signal";

declare global {
  interface Window {
    __perstaMetaPixelTry?: () => void;
  }
}

/**
 * Meta の広告の Pixel(広告から来た人が、サイトを訪れたか・登録したかを測る)。
 *
 * Meta の fbevents.js は、送る URL(dl)と来る前のページの URL(rl)をブラウザの本当の値から読み、
 * 外から差し替えられない(2026-10-26 に読んだもの)。そのため、**送るその瞬間の URL** で確かめる。
 * 1. 今の URL ときれいかどうか(isMetaPixelLoadableLocation と同じ決まり)を、ブラウザの側で確かめる。
 *    きれいなページを初めて開いたときに、fbevents.js を取りに行く(それまでは Meta へは何も取りに行かない)。
 * 2. fbevents.js が届いたときに、もう一度その時点の URL を確かめ、きれいなら init と「ページを見た」を送る。
 *    きれいでなければ待ち、ページを移ったあと(URL が新しくなったあと)の useEffect で、もう一度試す。
 * 3. 登録が終わったあと(AD_SIGNUP_META_COOKIE があるとき)は、続けて「登録した」(CompleteRegistration)を送り、印を消す。
 * 送るのは、この2つを1回の訪問で1回ずつだけ。
 *
 * 自動の計測は、init より前に止める。
 * - fbq.disablePushState: 画面の中でページを移るたびに「ページを見た」を送る(history.pushState を差し替える)
 * - autoConfig: ボタンを押したときの出来事(inferredevents)と、ページの中の情報(microdata)を送る
 * ⚠️ fbevents.js は Meta の CDN から最新を読み込む(版を固定できない)。uwt.js と同じく、
 *    数か月に1度は読み直して、名前と送る項目が変わっていないかを確かめること。
 */

/** <script> の中に埋める JSON。</script> などでタグを閉じさせない。 */
function toInlineScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildMetaPixelInlineScript(): string {
  return `
(function(){
  var R=${toInlineScriptJson(META_PIXEL_INLINE_RULES)};
  var ID='${META_PIXEL_ID}';
  var P=R.pathPatterns.map(function(s){return new RegExp(s);});
  function norm(path){
    var s=path.split('/');
    if(R.locales.indexOf(s[1])>-1){path='/'+s.slice(2).join('/');}
    path=path.replace(new RegExp('/+','g'),'/');
    if(path.length>1){path=path.replace(new RegExp('/+$'),'');}
    return path||'/';
  }
  function cleanUrl(u){
    if(u.hash)return false;
    var p=norm(u.pathname),ok=false,i;
    for(i=0;i<P.length;i++){if(P[i].test(p)){ok=true;break;}}
    if(!ok)return false;
    var bad=false;
    u.searchParams.forEach(function(v,k){if(R.allowedQueryKeys.indexOf(k)<0)bad=true;});
    return !bad;
  }
  function isClean(){
    try{
      var u=new URL(window.location.href);
      if(!cleanUrl(u))return false;
      var r=document.referrer;
      if(!r)return true;
      var ru=new URL(r);
      return ru.origin!==u.origin||cleanUrl(ru);
    }catch(e){return false;}
  }
  var injected=false,loaded=false,done=false;
  function inject(){
    injected=true;
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];n.disablePushState=true;t=b.createElement(e);t.async=!0;
    t.onload=function(){loaded=true;window.__perstaMetaPixelTry();};
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
  }
  window.__perstaMetaPixelTry=function(){
    if(done||!isClean())return;
    if(!injected){inject();return;}
    if(!loaded)return;
    done=true;
    window.fbq.disablePushState=true;
    window.fbq('set','autoConfig',false,ID);
    window.fbq('init',ID);
    window.fbq('track','PageView');
    if(document.cookie.split('; ').indexOf('${AD_SIGNUP_META_COOKIE}=1')>-1){
      window.fbq('track','CompleteRegistration');
      document.cookie='${AD_SIGNUP_META_COOKIE_DELETE}';
    }
  };
  window.__perstaMetaPixelTry();
})();
`;
}

export function MetaPixelScript() {
  const { enabled, pathname } = useAdPixelGate();

  // ページを移ったあと(URL が新しくなったあと)に、もう一度試す(読み込みの文が動く前は、何もしない)
  useEffect(() => {
    if (!enabled) return;
    window.__perstaMetaPixelTry?.();
  }, [enabled, pathname]);

  if (!enabled) {
    return null;
  }

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {buildMetaPixelInlineScript()}
    </Script>
  );
}
