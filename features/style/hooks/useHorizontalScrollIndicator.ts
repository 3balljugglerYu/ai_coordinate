"use client";

import { useEffect, useRef, useState } from "react";

/**
 * チップ列などの横スクロール領域に「常時表示のスクロールインジケーター」を
 * 付けるためのフック。探索シート(StyleBrowseSheet)と /styles のギャラリーで共用する。
 *
 * iOS Safari は ::-webkit-scrollbar による常時表示に非対応のため、自前の細い
 * バーを描画する。スクロールのたびに React state を更新するとリスト全体が
 * 再レンダリングされてカクつくため、effect 内で thumb の DOM スタイルを直接
 * 更新する(rAF で間引き、transform のみ動かしてレイアウトを発生させない)。
 *
 * 使い方:
 *  - スクロール領域(overflow-x-auto の要素)に `ref={setScrollEl}` を渡す
 *    (Radix の Portal 内など「open と同一コミットでマウントされない」ケースでも
 *     実際に DOM が生えたときに effect を再実行させるため callback ref を使う)
 *  - トラックは `style={{ visibility: "hidden" }}` で初期化し、はみ出しがある
 *    ときだけこのフックが表示に切り替える
 */
export function useHorizontalScrollIndicator({
  active = true,
  remeasureKey,
}: {
  /** false の間は監視しない(シートが閉じている間など)。 */
  active?: boolean;
  /** チップ構成の変化など、再計測をトリガーしたい値。 */
  remeasureKey?: unknown;
} = {}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const el = scrollEl;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!el || !track || !thumb) {
      return;
    }
    let rafId: number | null = null;
    const measure = () => {
      rafId = null;
      const { scrollWidth, clientWidth, scrollLeft } = el;
      if (scrollWidth <= clientWidth + 1) {
        track.style.visibility = "hidden";
        return;
      }
      track.style.visibility = "visible";
      const trackWidth = track.clientWidth;
      const thumbWidth = trackWidth * (clientWidth / scrollWidth);
      const maxScroll = scrollWidth - clientWidth;
      // RTL では scrollLeft が負になるため絶対値で進捗率にし、移動方向を反転する。
      const progress = Math.min(Math.abs(scrollLeft) / maxScroll, 1);
      const direction = getComputedStyle(track).direction === "rtl" ? -1 : 1;
      thumb.style.width = `${thumbWidth}px`;
      thumb.style.transform = `translateX(${
        direction * progress * (trackWidth - thumbWidth)
      }px)`;
    };
    const schedule = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(measure);
      }
    };
    measure();
    el.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(el);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      el.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
    };
  }, [active, scrollEl, remeasureKey]);

  return { setScrollEl, trackRef, thumbRef };
}
