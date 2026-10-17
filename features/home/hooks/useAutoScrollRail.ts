"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Swiper as SwiperType } from "swiper";

/**
 * 横に並べた棚(Swiper)を、ゆっくり自動で流し続ける。ホームの「簡単お着替え」と同じ動き(2026-10-17 ユーザー指示)。
 *
 * HomeStylePresetCarousel の動きを、そのまま写したもの(速さ・止めどき・位置の残し方が同じ)。
 * 企画の途中で生成の入口(簡単お着替え)のコードを触らないため、あちらはまだこの部品を使っていない。
 *
 * - 呼び出し側は、棚の中身を3回続けて並べる(つなぎ目を見せずに流し続けるため)。最初は真ん中の組から
 * - 指で触れている間・画面に見えていない間・タブが裏にある間は止める
 * - 位置は sessionStorage に残し、作品のページなどから戻ったときは続きから流す
 * - enabled が false なら何もしない(中身を1回だけ並べた、ふつうの棚のまま)
 */
export const AUTO_SCROLL_VELOCITY_PX_PER_SEC = 32;
/** 裏から戻ったときなどに1コマが長くなっても、この時間ぶんしか進めない */
export const AUTO_SCROLL_MAX_FRAME_DELTA_MS = 100;

/**
 * 1枚ぶんの送り幅(カードの幅 + すき間)を、Swiper が測った snapGrid から読む。
 * 測り終わる前は null。カードの幅やすき間を変えても、書き直さずに済むように数字を持たない。
 */
function getSlidePitchPx(swiper: SwiperType): number | null {
  const grid = swiper.snapGrid;
  if (!Array.isArray(grid) || grid.length < 2) {
    return null;
  }
  const pitch = grid[1] - grid[0];
  return pitch > 0 ? pitch : null;
}

function readSavedTranslate(storageKey: string): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (raw === null) {
      return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function saveCurrentTranslate(swiper: SwiperType | null, storageKey: string) {
  if (!swiper?.wrapperEl || typeof window === "undefined") {
    return;
  }
  try {
    // 指で弾いたあとの慣性で動いている途中でも、見えている位置を残す(簡単お着替えと同じ)
    const matrix = new DOMMatrixReadOnly(window.getComputedStyle(swiper.wrapperEl).transform);
    window.sessionStorage.setItem(storageKey, String(matrix.m41));
  } catch {
    // sessionStorage が使えない(プライベートモード・容量)ときは残さない
  }
}

export function useAutoScrollRail({
  itemCount,
  storageKey,
  enabled,
}: {
  /** 1組ぶんの枚数(3回並べる前の数) */
  itemCount: number;
  /** 位置を残す sessionStorage のキー(棚ごとに分ける) */
  storageKey: string;
  enabled: boolean;
}) {
  const swiperRef = useRef<SwiperType | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const isUserActiveRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let rafId: number | null = null;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(now - lastTime, AUTO_SCROLL_MAX_FRAME_DELTA_MS);
      lastTime = now;
      const swiper = swiperRef.current;
      if (swiper && swiper.wrapperEl && !isUserActiveRef.current && !swiper.animating) {
        const slidePitch = getSlidePitchPx(swiper);
        if (slidePitch !== null) {
          swiper.wrapperEl.style.transitionDuration = "0ms";
          const realWidthPx = itemCount * slidePitch;
          let next = swiper.translate - (AUTO_SCROLL_VELOCITY_PX_PER_SEC * delta) / 1000;
          // 3組のうち真ん中あたり [-2*1組, 0] に収める。どの組も見た目は同じなので、戻しても気づかれない
          if (next < -2 * realWidthPx) {
            next += realWidthPx;
          } else if (next > 0) {
            next -= realWidthPx;
          }
          swiper.setTranslate(next);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    const startTick = () => {
      if (rafId !== null) {
        return;
      }
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    };
    const stopTick = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    startTick();

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        if (entry.isIntersecting && !document.hidden) {
          startTick();
        } else {
          saveCurrentTranslate(swiperRef.current, storageKey);
          stopTick();
        }
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveCurrentTranslate(swiperRef.current, storageKey);
        stopTick();
        return;
      }
      const rect = container.getBoundingClientRect();
      const isOnScreen =
        rect.bottom > 0 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight);
      if (isOnScreen) {
        startTick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handlePageHide = () => {
      saveCurrentTranslate(swiperRef.current, storageKey);
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      saveCurrentTranslate(swiperRef.current, storageKey);
      stopTick();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [enabled, itemCount, storageKey]);

  const onSwiper = useCallback(
    (swiper: SwiperType) => {
      swiperRef.current = swiper;
      if (!enabled) {
        return;
      }
      const wrapperEl = swiper.wrapperEl;
      if (!wrapperEl) {
        return;
      }
      wrapperEl.style.transitionDuration = "0ms";
      // 送り幅を読む前に、Swiper に並びを測らせる
      swiper.update();
      const slidePitch = getSlidePitchPx(swiper);
      const realWidthPx = slidePitch !== null ? itemCount * slidePitch : null;
      const savedTranslate = readSavedTranslate(storageKey);
      // 最初は真ん中の組から(左右どちらに引いても続きが見える)。残した位置は真ん中の帯に直して使う
      let initialTranslate = realWidthPx !== null ? -realWidthPx : 0;
      if (savedTranslate !== null && realWidthPx !== null) {
        let normalized = savedTranslate;
        while (normalized > 0) normalized -= realWidthPx;
        while (normalized < -2 * realWidthPx) normalized += realWidthPx;
        initialTranslate = normalized;
      }
      swiper.setTranslate(initialTranslate);
      wrapperEl.style.transform = `translate3d(${swiper.translate}px, 0, 0)`;
      void wrapperEl.offsetHeight;
      wrapperEl.style.transitionDuration = "";
    },
    [enabled, itemCount, storageKey],
  );

  const onTouchStart = useCallback(() => {
    isUserActiveRef.current = true;
  }, []);
  const onTouchEnd = useCallback(() => {
    isUserActiveRef.current = false;
  }, []);
  /** 別のページへ移る前に呼ぶ(戻ったときに続きから流すため) */
  const saveTranslate = useCallback(() => {
    saveCurrentTranslate(swiperRef.current, storageKey);
  }, [storageKey]);

  return { containerRef, onSwiper, onTouchStart, onTouchEnd, saveTranslate };
}
