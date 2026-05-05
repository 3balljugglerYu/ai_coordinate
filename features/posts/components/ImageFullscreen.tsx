"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFullscreenImageGestures } from "@/features/generation/hooks/useFullscreenImageGestures";

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

/**
 * 画像の全画面表示コンポーネント
 * - 単一画像（imageUrl + alt）または複数画像（images）に対応
 * - 複数枚のときは左右矢印 / 横スワイプで切替
 * - ピンチズームとダブルタップズーム対応
 *
 * ジェスチャ系の実装は `useFullscreenImageGestures` に統合され、
 * /coordinate のリスト/グリッド表示で使われる `ImageModal` と共有している。
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

  const hasMultiple = items.length > 1;

  const { imageStyle, containerHandlers, reset } = useFullscreenImageGestures({
    hasMultiple,
    onClose,
    onSwipePrev: () => goTo((index - 1 + items.length) % items.length),
    onSwipeNext: () => goTo((index + 1) % items.length),
  });

  // 拡大状態をリセットして指定 index に移動するヘルパー
  const goTo = (newIndex: number) => {
    setIndex(newIndex);
    reset();
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
  }, [isOpen, items.length, index, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || items.length === 0) return null;

  const current = items[Math.min(index, items.length - 1)];

  const goPrev = () => {
    goTo((index - 1 + items.length) % items.length);
  };
  const goNext = () => {
    goTo((index + 1) % items.length);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black px-4 pb-4 pt-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      {...containerHandlers}
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
        <div className="relative" style={imageStyle}>
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
