"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FullscreenImageItem {
  url: string;
  alt: string;
  label?: string;
}

interface ImageFullscreenProps {
  /** 互換用: 単一画像を表示するときに使う。 */
  imageUrl?: string;
  alt?: string;
  /** 複数画像を切替表示する場合はこちらを使う。 */
  images?: FullscreenImageItem[];
  /** images 指定時の初期表示 index。 */
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

const SWIPE_THRESHOLD_PX = 50;

/**
 * 画像の全画面表示コンポーネント
 * - 単一画像（imageUrl + alt）または複数画像（images）に対応
 * - 複数枚のときは左右矢印 / 横スワイプで切替
 * - ピンチズームとダブルタップズーム対応
 */
export function ImageFullscreen({
  imageUrl,
  alt,
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: ImageFullscreenProps) {
  // 単一/複数を内部的に統一して扱う
  const items = useMemo<FullscreenImageItem[]>(() => {
    if (images && images.length > 0) {
      return images;
    }
    if (imageUrl) {
      return [{ url: imageUrl, alt: alt ?? "" }];
    }
    return [];
  }, [images, imageUrl, alt]);

  // initialIndex は mount 時の初期値としてのみ使う（親側で key 切替で再 mount される想定）
  const safeInitialIndex = Math.min(
    Math.max(initialIndex, 0),
    Math.max(items.length - 1, 0)
  );
  const [index, setIndex] = useState(safeInitialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(
    null
  );
  const [lastDoubleTapTime, setLastDoubleTapTime] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // 拡大状態をリセットして指定 index に移動するヘルパー
  const goTo = (newIndex: number) => {
    setIndex(newIndex);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // キーボード矢印で切替（PC 操作補助）
  useEffect(() => {
    if (!isOpen || items.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goTo((index - 1 + items.length) % items.length);
      } else if (e.key === "ArrowRight") {
        goTo((index + 1) % items.length);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, items.length, index, onClose]);

  if (!isOpen || items.length === 0) return null;

  const current = items[Math.min(index, items.length - 1)];
  const hasMultiple = items.length > 1;

  const goPrev = () => {
    goTo((index - 1 + items.length) % items.length);
  };
  const goNext = () => {
    goTo((index + 1) % items.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // シングルタッチ：ドラッグ開始 + スワイプ起点
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
      // 拡大していないときだけスワイプ判定の起点を覚える
      if (scale === 1) {
        setTouchStartX(e.touches[0].clientX);
        setTouchStartY(e.touches[0].clientY);
      }

      // ダブルタップ検知
      const now = Date.now();
      if (now - lastDoubleTapTime < 300) {
        if (scale === 1) {
          setScale(2);
        } else {
          setScale(1);
          setPosition({ x: 0, y: 0 });
        }
      }
      setLastDoubleTapTime(now);
    } else if (e.touches.length === 2) {
      // ピンチズーム開始
      setIsDragging(false);
      setTouchStartX(null);
      setTouchStartY(null);
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      setLastTouchDistance(distance);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && scale > 1) {
      // 拡大中のドラッグ（位置移動）
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && lastTouchDistance !== null) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch1.clientX - touch2.clientX,
        touch1.clientY - touch2.clientY
      );
      const scaleChange = distance / lastTouchDistance;
      const newScale = Math.max(1, Math.min(scale * scaleChange, 5));
      setScale(newScale);
      setLastTouchDistance(distance);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    setLastTouchDistance(null);

    // スワイプ判定（拡大していないときのみ）
    if (scale === 1 && touchStartX !== null && touchStartY !== null) {
      const endTouch = e.changedTouches[0];
      if (endTouch) {
        const dx = endTouch.clientX - touchStartX;
        const dy = endTouch.clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // 縦下方向のスワイプが優勢かつ閾値を超えたら閉じる
        if (dy > SWIPE_THRESHOLD_PX && absDy > absDx) {
          onClose();
        }
        // 横方向のスワイプが優勢かつ閾値を超えたら左右切替（複数画像時のみ）
        else if (
          hasMultiple &&
          absDx > SWIPE_THRESHOLD_PX &&
          absDx > absDy
        ) {
          if (dx > 0) {
            goPrev();
          } else {
            goNext();
          }
        }
      }
    }
    setTouchStartX(null);
    setTouchStartY(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(1, Math.min(scale * delta, 5));
    setScale(newScale);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black px-4 pb-4 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* 閉じるボタン */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-20 rounded-full bg-black/50 text-white hover:bg-black/70"
        onClick={onClose}
        aria-label="閉じる"
      >
        <X className="h-5 w-5" />
      </Button>

      {/* 画像と同じサイズに collapse するラッパー。
          矢印・ラベルはこのラッパー基準で配置する（= 画像の上下中央 / 下端中央）。
          inline-block + max-h/max-w で <Image> の表示サイズと一致させる。 */}
      <div className="relative inline-block max-h-[calc(100vh-5rem)] max-w-[calc(100vw-2rem)]">
        {/* 画像本体（拡大ズーム適用） */}
        <div
          className="relative"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition:
              isDragging || lastTouchDistance !== null ? "none" : "transform 0.2s",
          }}
        >
          <Image
            src={current.url}
            alt={current.alt}
            width={1200}
            height={1200}
            className="block max-h-[calc(100vh-5rem)] max-w-[calc(100vw-2rem)] object-contain"
            style={{ userSelect: "none" }}
            draggable={false}
            sizes="100vw"
            priority
          />
        </div>

        {/* 矢印（複数画像時のみ、画像の上下中央） */}
        {hasMultiple && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              aria-label="前の画像"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              aria-label="次の画像"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

      </div>
    </div>
  );
}
