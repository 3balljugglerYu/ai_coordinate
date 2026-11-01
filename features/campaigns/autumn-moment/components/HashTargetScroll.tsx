"use client";

import { useEffect } from "react";

/** 上で高さが変わっても(画像の読み込みなど)、飛んだ先をこの時間だけ合わせ直す */
export const HASH_TARGET_SETTLE_MS = 8000;

/** 場所つきの URL で開ける場所(企画ページの項目の見出し) */
export const HASH_TARGET_IDS: readonly string[] = [
  "am-works",
  "am-about",
  "am-join",
  "am-generate",
  "am-prize",
  "am-schedule",
  "am-more",
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
 * `/campaigns/autumn-moment#am-works` のように、ページの中の場所つきの URL で開いたときに、その場所へ移る
 * (ハロウィン企画の HashTargetScroll と同じ動き。くわしい理由はそちら)。
 *
 * 中身があとから届くページなので、描いたあとにここで移し、少しのあいだ高さが変わるたびに合わせ直す。
 * 自分でスクロールや操作をしたらやめる。終えたら URL から場所を外す(「戻る」でまた移らないように)。
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
    const onScroll = () => {
      if (Math.abs(target.getBoundingClientRect().top - alignedTop) > USER_SCROLL_THRESHOLD_PX) finish();
    };
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
