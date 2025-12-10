"use client";

import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import type { GeneratedImageData } from "../types";
import { getCurrentUserId } from "../lib/generation-service";
import { getGeneratedImages } from "../lib/database";

const PAGE_SIZE = 4;

interface GeneratedImageGalleryClientProps {
  initialImages: GeneratedImageData[];
}

/**
 * クライアントコンポーネント: 生成結果一覧の表示と無限スクロール
 */
export function GeneratedImageGalleryClient({ initialImages }: GeneratedImageGalleryClientProps) {
  const [images, setImages] = useState<GeneratedImageData[]>(initialImages);
  const [offset, setOffset] = useState(initialImages.length);
  const [hasMore, setHasMore] = useState(initialImages.length === PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  // initialImagesが変更されたら状態を更新
  useEffect(() => {
    setImages(initialImages);
    setOffset(initialImages.length);
    setHasMore(initialImages.length === PAGE_SIZE);
  }, [initialImages]);

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

        const converted = records
          .map((record) => {
            if (!record.id) return null;
            return {
              id: record.id,
              url: record.image_url,
            };
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
      <GeneratedImageGallery images={images} />
      {/* 無限スクロール用トリガー */}
      {hasMore && (
        <div ref={loadMoreRef} className="h-8 w-full" />
      )}
    </>
  );
}
