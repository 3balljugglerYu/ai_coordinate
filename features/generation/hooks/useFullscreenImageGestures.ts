"use client";

import { useCallback, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

/**
 * 全画面画像ビューワー（/posts/[id] の `ImageFullscreen` と /coordinate のリスト
 * /グリッド表示の `ImageModal`）で共有するジェスチャ・ズーム・パンの状態管理。
 *
 * - シングルタッチ: ドラッグ（拡大時のみパン）/ ダブルタップで 1x ↔ 2x ズーム /
 *   横スワイプで前後画像切替 / 下方向スワイプで閉じる（いずれも非拡大時のみ）
 * - ピンチ（2 本指）: 拡大率を 1x〜5x の範囲で変更
 * - マウスホイール: 1x〜5x の範囲で拡大率を変更
 * - マウスドラッグ: 拡大時のみパン
 *
 * 上記の挙動はもともと `ImageFullscreen.tsx` に実装されていたものを抽出・統合したもの。
 */

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SWIPE_THRESHOLD_PX = 50;
const DOUBLE_TAP_THRESHOLD_MS = 300;
const ZOOMED_SCALE = 2;

interface UseFullscreenImageGesturesOptions {
  /** 横スワイプによる前後切替を有効にするかどうか（複数画像かどうかで決まる）。 */
  hasMultiple: boolean;
  /** 下方向スワイプ／背景クリック時のクローズコールバック。 */
  onClose: () => void;
  /** 横スワイプで前画像へ。`hasMultiple=true` のときに呼ばれる。 */
  onSwipePrev?: () => void;
  /** 横スワイプで次画像へ。`hasMultiple=true` のときに呼ばれる。 */
  onSwipeNext?: () => void;
}

export interface UseFullscreenImageGesturesResult {
  /** 1〜5 の拡大率。 */
  scale: number;
  /** 拡大中かどうか（scale > 1）。 */
  isZoomed: boolean;
  /** 画像要素に渡す style（transform / transition）。 */
  imageStyle: CSSProperties;
  /** モーダルコンテナに渡すハンドラ群。 */
  containerHandlers: {
    onTouchStart: (e: ReactTouchEvent) => void;
    onTouchMove: (e: ReactTouchEvent) => void;
    onTouchEnd: (e: ReactTouchEvent) => void;
    onMouseDown: (e: ReactMouseEvent) => void;
    onMouseMove: (e: ReactMouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onWheel: (e: ReactWheelEvent) => void;
  };
  /** 画像切替時など、拡大状態をリセットする。 */
  reset: () => void;
}

export function useFullscreenImageGestures({
  hasMultiple,
  onClose,
  onSwipePrev,
  onSwipeNext,
}: UseFullscreenImageGesturesOptions): UseFullscreenImageGesturesResult {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(
    null,
  );
  const lastDoubleTapTimeRef = useRef(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setLastTouchDistance(null);
    setTouchStartX(null);
    setTouchStartY(null);
  }, []);

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({
          x: touch.clientX - position.x,
          y: touch.clientY - position.y,
        });
        if (scale === 1) {
          setTouchStartX(touch.clientX);
          setTouchStartY(touch.clientY);
        }

        const now = Date.now();
        if (now - lastDoubleTapTimeRef.current < DOUBLE_TAP_THRESHOLD_MS) {
          if (scale === 1) {
            setScale(ZOOMED_SCALE);
          } else {
            setScale(1);
            setPosition({ x: 0, y: 0 });
          }
        }
        lastDoubleTapTimeRef.current = now;
      } else if (e.touches.length === 2) {
        // ピンチズーム開始: スワイプ起点をクリアして横スワイプ誤検出を防ぐ
        setIsDragging(false);
        setTouchStartX(null);
        setTouchStartY(null);
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const distance = Math.hypot(
          t1.clientX - t2.clientX,
          t1.clientY - t2.clientY,
        );
        setLastTouchDistance(distance);
      }
    },
    [position.x, position.y, scale],
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length === 1 && isDragging && scale > 1) {
        const touch = e.touches[0];
        setPosition({
          x: touch.clientX - dragStart.x,
          y: touch.clientY - dragStart.y,
        });
      } else if (e.touches.length === 2 && lastTouchDistance !== null) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const distance = Math.hypot(
          t1.clientX - t2.clientX,
          t1.clientY - t2.clientY,
        );
        const delta = distance / lastTouchDistance;
        const next = Math.max(MIN_SCALE, Math.min(scale * delta, MAX_SCALE));
        setScale(next);
        setLastTouchDistance(distance);
      }
    },
    [isDragging, scale, dragStart.x, dragStart.y, lastTouchDistance],
  );

  const handleTouchEnd = useCallback(
    (e: ReactTouchEvent) => {
      setIsDragging(false);
      setLastTouchDistance(null);

      if (scale === 1 && touchStartX !== null && touchStartY !== null) {
        const endTouch = e.changedTouches[0];
        if (endTouch) {
          const dx = endTouch.clientX - touchStartX;
          const dy = endTouch.clientY - touchStartY;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          if (dy > SWIPE_THRESHOLD_PX && absDy > absDx) {
            onClose();
          } else if (
            hasMultiple &&
            absDx > SWIPE_THRESHOLD_PX &&
            absDx > absDy
          ) {
            if (dx > 0) {
              onSwipePrev?.();
            } else {
              onSwipeNext?.();
            }
          }
        }
      }
      setTouchStartX(null);
      setTouchStartY(null);
    },
    [scale, touchStartX, touchStartY, hasMultiple, onClose, onSwipePrev, onSwipeNext],
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button === 0) {
        setIsDragging(true);
        setDragStart({
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        });
      }
    },
    [position.x, position.y],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      if (isDragging && scale > 1) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, scale, dragStart.x, dragStart.y],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback(
    (e: ReactWheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((current) =>
        Math.max(MIN_SCALE, Math.min(current * delta, MAX_SCALE)),
      );
    },
    [],
  );

  const imageStyle: CSSProperties = {
    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
    transition:
      isDragging || lastTouchDistance !== null ? "none" : "transform 0.2s",
  };

  return {
    scale,
    isZoomed: scale > 1,
    imageStyle,
    containerHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onWheel: handleWheel,
    },
    reset,
  };
}
