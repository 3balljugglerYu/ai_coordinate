"use client";

import { useEffect } from "react";

/** 上で高さが変わっても(エントリーのカードや画像の読み込みなど)、飛んだ先をこの時間だけ合わせ直す */
export const HASH_TARGET_SETTLE_MS = 8000;

/** 場所つきの URL で開ける場所(企画ページの項目の見出し)。タブの中など、隠れることがある場所は入れない */
export const HASH_TARGET_IDS: readonly string[] = [
  "hbs-entry-top",
  "hbs-works",
  "hbs-about",
  "hbs-prize",
  "hbs-join",
  "hbs-schedule",
  "hbs-more",
];

/**
 * scroll が届いても、飛んだ先が合わせた位置からこれ以上動いていなければ、自分でスクロールしたとは見なさない
 * (ここで移したときや、上の高さが変わってブラウザが位置を保ったときにも scroll が届く)
 */
const USER_SCROLL_THRESHOLD_PX = 2;

/** URL から場所(#…)を外す。Next.js が持っている履歴の中身(history.state)はそのまま残す */
function removeHashFromUrl() {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}`);
}

/**
 * `/campaigns/halloween-best-shot#hbs-works` のように、ページの中の場所つきの URL で開いたときに、その場所へ移る
 * (2026-10-25 ユーザー指示: 開いたら対象作品のところへ行ける URL)。
 *
 * このページは中身があとから届く(企画ページは対象作品を読み終えてから描く)。ブラウザは届く前に
 * 飛び先を探して見つけられず、上のまま止まるので、描いたあとにここで移す。
 * そのあと上のエントリーのカードや画像が読み込まれて高さが変わると、飛んだ先が下へずれる。
 * 少しのあいだ、高さが変わるたびに合わせ直す。自分でスクロールや操作をしたら、そこでやめる。
 *
 * 合わせ直しを終えたら URL から場所を外す。残しておくと、ほかのページから「戻る」で帰ってきたときにも
 * また移ってしまい、元の場所(Next.js が戻す位置)が失われるため。ページの中のリンク(#hbs-works)で
 * 移ったときも同じ理由で外す。
 */
export function HashTargetScroll() {
  useEffect(() => {
    // ページの中のリンクで場所が付いたら外す(移るのはブラウザがする)
    const onHashChange = () => {
      if (HASH_TARGET_IDS.includes(window.location.hash.slice(1))) removeHashFromUrl();
    };
    window.addEventListener("hashchange", onHashChange);

    const id = window.location.hash.slice(1);
    const target = HASH_TARGET_IDS.includes(id) ? document.getElementById(id) : null;
    if (!target) {
      return () => window.removeEventListener("hashchange", onHashChange);
    }

    let alignedTop = 0;
    // なめらかに流さない(html の scroll-behavior: smooth に従わせない)。scroll-margin-top は効く
    const align = () => {
      target.scrollIntoView({ block: "start", behavior: "instant" });
      alignedTop = target.getBoundingClientRect().top;
    };
    align();

    let stopped = false;
    let timer = 0;
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (!stopped) align();
          });
    resizeObserver?.observe(document.body);

    const userEvents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    // スクロールバーを動かしたときなどは scroll しか届かない。飛んだ先が動いていたら、自分でスクロールした
    const onScroll = () => {
      if (Math.abs(target.getBoundingClientRect().top - alignedTop) > USER_SCROLL_THRESHOLD_PX) finish();
    };
    // 合わせ直しを終えたら(時間切れ・自分で操作した)、URL から場所を外す。描き直しで片付けるとき
    // (React の開発時の2回目の描画など)は外さない。外すと、描き直したあとに飛び先が分からなくなる
    const finish = () => {
      if (stopped) return;
      stop();
      removeHashFromUrl();
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      resizeObserver?.disconnect();
      for (const name of userEvents) window.removeEventListener(name, finish);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
    for (const name of userEvents) window.addEventListener(name, finish, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    timer = window.setTimeout(finish, HASH_TARGET_SETTLE_MS);
    return () => {
      stop();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return null;
}
