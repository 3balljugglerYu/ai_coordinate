"use client";

import { useState, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import type { GeneratedImageData } from "../types";
import { getCurrentUserId } from "../lib/generation-service";
import { getGeneratedImages } from "../lib/database";
import { useGenerationState } from "../context/GenerationStateContext";

const PAGE_SIZE = 4;

interface GeneratedImageGalleryClientProps {
  initialImages: GeneratedImageData[];
}

/**
 * クライアントコンポーネント: 生成結果一覧の表示と無限スクロール
 */
export function GeneratedImageGalleryClient({ initialImages }: GeneratedImageGalleryClientProps) {
  const genState = useGenerationState();
  const [images, setImages] = useState<GeneratedImageData[]>(initialImages);
  const [offset, setOffset] = useState(initialImages.length);
  const [hasMore, setHasMore] = useState(initialImages.length === PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const prevInitialImagesRef = useRef<GeneratedImageData[]>(initialImages);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  // initialImagesが変更されたら状態を更新
  useEffect(() => {
    // 既存画像のIDセットを作成（前回値から）
    const existingIds = new Set(prevInitialImagesRef.current.map((img) => img.id));
    const newImages = initialImages.filter((img) => !existingIds.has(img.id));

    // initialImagesを先頭にし、既存の画像をその後に連結
    setImages((prev) => {
      const prevExistingIds = new Set(prev.map((img) => img.id));
      const prevNewImages = initialImages.filter((img) => !prevExistingIds.has(img.id));

      if (prevNewImages.length > 0) {
        const initialImageIds = new Set(initialImages.map((img) => img.id));
        const existingImagesNotInInitial = prev.filter(
          (img) => !initialImageIds.has(img.id)
        );
        return [...initialImages, ...existingImagesNotInInitial];
      }
      return prev;
    });

    setOffset((prev) => Math.max(prev, initialImages.length));
    setHasMore(initialImages.length === PAGE_SIZE);
    prevInitialImagesRef.current = initialImages;

    // 生成中かつサーバーから新しい画像が届いたら isGenerating を解除
    // → スケルトンから画像へシームレスに差し替わる（一瞬非表示になるのを防ぐ）
    if (genState?.isGenerating && newImages.length > 0) {
      genState.setIsGenerating(false);
    }
  }, [initialImages, genState]);

  // 無限スクロール: 最下部が表示されたら追加で取得
  useEffect(() => {
    if (!inView || isLoading || !hasMore) return;

    const fetchMore = async () => {
      try {
        setIsLoading(true);
        const userId = await getCurrentUserId();
        if (!userId) {
          setHasMore(false);
          return;
        }
        const records = await getGeneratedImages(
          userId,
          PAGE_SIZE,
          offset,
          "coordinate"
        );

        const converted: GeneratedImageData[] = records
          .map((record) => {
            if (!record.id) return null;
            return {
              id: record.id,
              url: record.image_url,
              is_posted: record.is_posted ?? false,
            } as GeneratedImageData;
          })
          .filter((img): img is GeneratedImageData => img !== null);

        setImages((prev) => {
          const existingIds = new Set(prev.map((img) => img.id));
          const merged = [
            ...prev,
            ...converted.filter((img) => !existingIds.has(img.id)),
          ];
          return merged;
        });

        setOffset((prev) => prev + records.length);
        setHasMore(records.length === PAGE_SIZE);
      } catch (err) {
        console.error("[GeneratedImageGalleryClient] 追加取得エラー:", err);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchMore();
  }, [inView, isLoading, hasMore, offset]);

  return (
    <>
      <GeneratedImageGallery
        images={images}
        isGenerating={genState?.isGenerating ?? false}
        generatingCount={genState?.generatingCount ?? 0}
        completedCount={genState?.completedCount ?? 0}
      />
      {/* 無限スクロール用トリガー */}
      {hasMore && (
        <div ref={loadMoreRef} className="h-8 w-full" />
      )}
    </>
  );
}
