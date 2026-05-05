"use client";

import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { useTranslations } from "next-intl";
import { GeneratedImageGallery } from "./GeneratedImageGallery";
import { GeneratedImageList } from "./GeneratedImageList";
import { GalleryViewToggle } from "./GalleryViewToggle";
import type { GeneratedImageData } from "../types";
import { getCurrentUserId } from "../lib/current-user";
import { getGeneratedImages } from "../lib/database";
import { useGenerationState } from "../context/GenerationStateContext";
import {
  readPreferredGalleryView,
  writePreferredGalleryView,
  type CoordinateGalleryView,
} from "../lib/gallery-view-preference";

const PAGE_SIZE = 4;

interface GeneratedImageGalleryClientProps {
  initialImages: GeneratedImageData[];
}

/**
 * クライアントコンポーネント: 生成結果一覧の表示と無限スクロール
 */
export function GeneratedImageGalleryClient({ initialImages }: GeneratedImageGalleryClientProps) {
  const t = useTranslations("coordinate");
  const genState = useGenerationState();
  const [images, setImages] = useState<GeneratedImageData[]>(initialImages);
  const [offset, setOffset] = useState(initialImages.length);
  const [hasMore, setHasMore] = useState(initialImages.length === PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<CoordinateGalleryView>("grid");

  // localStorage に保存された前回の表示モードを復元（初回マウント時）。
  // SSR の HTML と一致させるため、初期値は "grid" 固定で起動して useEffect で上書きする。
  useEffect(() => {
    setViewMode(readPreferredGalleryView());
  }, []);

  const handleViewChange = (next: CoordinateGalleryView) => {
    setViewMode(next);
    writePreferredGalleryView(next);
  };

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  // initialImagesが変更されたら状態を更新
  useEffect(() => {
    // 既存画像のIDセットを作成（前回値から）
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
              prompt: record.prompt ?? "",
              createdAt: record.created_at,
              model: record.model ?? null,
              width: record.width ?? null,
              height: record.height ?? null,
              fromStock: Boolean(record.source_image_stock_id),
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

  const previewImages = genState?.previewImages ?? [];
  const previewImagesByUrl = new Map(
    previewImages.map((image) => [image.url, image] as const)
  );
  const remainingPreviewImages = previewImages.filter(
    (image) => !images.some((persistedImage) => persistedImage.url === image.url)
  );
  const galleryImages = [
    ...remainingPreviewImages,
    ...images.map((image) => {
      const matchingPreview = previewImagesByUrl.get(image.url);
      if (!matchingPreview) {
        return image;
      }

      return {
        ...image,
        jobId: matchingPreview.jobId ?? image.jobId,
        galleryKey:
          matchingPreview.galleryKey ??
          matchingPreview.id ??
          image.galleryKey ??
          image.id,
      };
    }),
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">
          {t("resultsTitle")}
        </h2>
        <GalleryViewToggle value={viewMode} onChange={handleViewChange} />
      </div>
      {viewMode === "grid" ? (
        <GeneratedImageGallery
          images={galleryImages}
          isGenerating={genState?.isGenerating ?? false}
          generatingCount={genState?.generatingCount ?? 0}
        />
      ) : (
        <GeneratedImageList
          images={galleryImages}
          isGenerating={genState?.isGenerating ?? false}
          generatingCount={genState?.generatingCount ?? 0}
        />
      )}
      {/* 無限スクロール用トリガー */}
      {hasMore && (
        <div ref={loadMoreRef} className="h-8 w-full" />
      )}
    </>
  );
}
