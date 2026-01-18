"use client";

import { useState, useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { EventImageGallery } from "./EventImageGallery";
import type { EventImageData } from "../types";
import { getEventImages } from "../lib/database";
import { EVENT_PAGE_SIZE } from "../lib/constants";
import { convertGeneratedImageRecordsToEventImageData } from "../lib/utils";

interface EventImageGalleryClientProps {
  initialImages: EventImageData[];
}

/**
 * クライアントコンポーネント: イベント画像一覧の表示と無限スクロール
 */
export function EventImageGalleryClient({ initialImages }: EventImageGalleryClientProps) {
  const [images, setImages] = useState<EventImageData[]>(initialImages);
  const [offset, setOffset] = useState(initialImages.length);
  const [hasMore, setHasMore] = useState(initialImages.length === EVENT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const prevInitialImagesRef = useRef<EventImageData[]>(initialImages);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  // initialImagesが変更されたら状態を更新
  useEffect(() => {
    setImages((prev) => {
      const existingIds = new Set(prev.map((img) => img.id));
      
      const newImages = initialImages.filter((img) => !existingIds.has(img.id));
      
      if (newImages.length > 0) {
        const initialImageIds = new Set(initialImages.map((img) => img.id));
        const existingImagesNotInInitial = prev.filter(
          (img) => !initialImageIds.has(img.id)
        );
        return [...initialImages, ...existingImagesNotInInitial];
      }
      
      return prev;
    });
    
    setOffset((prev) => Math.max(prev, initialImages.length));
    setHasMore(initialImages.length === EVENT_PAGE_SIZE);
    prevInitialImagesRef.current = initialImages;
  }, [initialImages]);

  // 無限スクロール: 最下部が表示されたら追加で取得
  useEffect(() => {
    if (!inView || isLoading || !hasMore) return;

    const fetchMore = async () => {
      try {
        setIsLoading(true);
        const records = await getEventImages(EVENT_PAGE_SIZE, offset);

        // GeneratedImageRecord -> EventImageData 変換
        const converted = convertGeneratedImageRecordsToEventImageData(records);

        setImages((prev) => {
          const existingIds = new Set(prev.map((img) => img.id));
          const merged = [
            ...prev,
            ...converted.filter((img) => !existingIds.has(img.id)),
          ];
          return merged;
        });

        setOffset((prev) => prev + records.length);
        setHasMore(records.length === EVENT_PAGE_SIZE);
      } catch (err) {
        console.error("[EventImageGalleryClient] 追加取得エラー:", err);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchMore();
  }, [inView, isLoading, hasMore, offset]);

  return (
    <>
      <EventImageGallery images={images} />
      {/* 無限スクロール用トリガー */}
      {hasMore && (
        <div ref={loadMoreRef} className="h-8 w-full" />
      )}
    </>
  );
}
