"use client";

import { useState, useEffect, useRef } from "react";
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
  const prevInitialImagesRef = useRef<GeneratedImageData[]>(initialImages);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  // initialImagesが変更されたら状態を更新
  useEffect(() => {
    // initialImagesを先頭にし、既存の画像をその後に連結
    setImages((prev) => {
      // 既存画像のIDセットを作成
      const existingIds = new Set(prev.map((img) => img.id));
      
      // initialImagesから新しい画像（まだ表示されていない画像）を抽出
      const newImages = initialImages.filter((img) => !existingIds.has(img.id));
      
      // 新しい画像がある場合のみ更新
      if (newImages.length > 0) {
        // 既存画像から、initialImagesに含まれていない画像を抽出
        // O(N*M)を避けるため、initialImagesのIDをSetに変換してO(1)ルックアップを使用
        const initialImageIds = new Set(initialImages.map((img) => img.id));
        const existingImagesNotInInitial = prev.filter(
          (img) => !initialImageIds.has(img.id)
        );
        // initialImagesを先頭に、既存画像をその後に連結
        return [...initialImages, ...existingImagesNotInInitial];
      }
      
      // 新しい画像がない場合は既存の状態を維持
      return prev;
    });
    
    // offsetは、既存画像の長さを考慮して調整
    setOffset((prev) => {
      // 新しい画像が追加されても、既に読み込んだ画像は保持するため、
      // offsetは既存画像の長さとinitialImagesの長さの最大値にする
      return Math.max(prev, initialImages.length);
    });
    
    // hasMoreは、initialImagesの長さを基準に判定
    setHasMore(initialImages.length === PAGE_SIZE);
    
    // 前回のinitialImagesを更新
    prevInitialImagesRef.current = initialImages;
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
      <GeneratedImageGallery images={images} />
      {/* 無限スクロール用トリガー */}
      {hasMore && (
        <div ref={loadMoreRef} className="h-8 w-full" />
      )}
    </>
  );
}
