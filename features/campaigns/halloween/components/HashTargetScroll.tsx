"use client";

import { useEffect } from "react";

/** 上で高さが変わっても(エントリーのカードの読み込みなど)、飛んだ先をこの時間だけ合わせ直す */
export const HASH_TARGET_SETTLE_MS = 4000;

/**
 * `/campaigns/halloween-best-shot#hbs-works` のように、ページの中の場所つきの URL で開いたときに、その場所へ移る
 * (2026-10-25 ユーザー指示: 開いたら対象作品のところへ行ける URL)。
 *
 * このページは中身があとから届く(企画ページは対象作品を読み終えてから描く)。ブラウザは届く前に
 * 飛び先を探して見つけられず、上のまま止まるので、描いたあとにここで移す。
 * そのあと上のエントリーのカードが読み込まれて高さが変わると、飛んだ先が下へずれる。
 * 少しのあいだ、高さが変わるたびに合わせ直す。自分でスクロールや操作をしたら、そこでやめる。
 *
 * 移るのは、このページの場所(id が hbs- で始まる)だけ。
 */
export function HashTargetScroll() {
  useEffect(() => {
    let id: string;
    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!id.startsWith("hbs-")) return;
    const target = document.getElementById(id);
    if (!target) return;

    // 合わせ直すのは、ここで移した分だけ(なめらかに流さない。scroll-margin-top は効く)
    const align = () => target.scrollIntoView({ block: "start" });
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
    const stop = () => {
      if (stopped) return;
      stopped = true;
      resizeObserver?.disconnect();
      for (const name of userEvents) window.removeEventListener(name, stop);
      window.clearTimeout(timer);
    };
    for (const name of userEvents) window.addEventListener(name, stop, { passive: true });
    timer = window.setTimeout(stop, HASH_TARGET_SETTLE_MS);
    return stop;
  }, []);

  return null;
}
