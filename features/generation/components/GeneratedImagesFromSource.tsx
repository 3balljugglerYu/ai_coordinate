 "use client";

import { useState, useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  getGeneratedImagesBySourceImage,
  type GeneratedImageRecord,
} from "../lib/database";
import Image from "next/image";
import Link from "next/link";

interface GeneratedImagesFromSourceProps {
  stockId: string | null;
  storagePath: string | null;
  onImageClick?: (image: GeneratedImageRecord) => void;
  className?: string;
}

const PAGE_SIZE = 4;

export function GeneratedImagesFromSource({
  stockId,
  storagePath,
  onImageClick,
  className,
}: GeneratedImagesFromSourceProps) {
  const [images, setImages] = useState<GeneratedImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "200px",
    triggerOnce: false,
  });

  useEffect(() => {
    if (!stockId && !storagePath) {
      setImages([]);
      return;
    }

    const loadImages = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getGeneratedImagesBySourceImage(stockId, storagePath);
        setImages(data);
        setVisibleCount(Math.min(PAGE_SIZE, data.length));
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "生成画像の取得に失敗しました";
        setError(errorMessage);
        console.error("Failed to load generated images:", err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadImages();
  }, [stockId, storagePath]);

  useEffect(() => {
    if (!inView) return;
    if (visibleCount >= images.length) return;

    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, images.length));
  }, [inView, visibleCount, images.length]);

  if (!stockId && !storagePath) {
    return null;
  }

  const displayedImages = images.slice(0, visibleCount);
  const hasMore = visibleCount < images.length;

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
        <p className="text-sm text-red-900">{error}</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-gray-500 ${className}`}>
        <ImageIcon className="mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm">この元画像から生成された画像はありません</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          この元画像から生成された画像 ({images.length}件)
        </h3>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {displayedImages.map((image) => (
          <div
            key={image.id}
            className="flex-shrink-0 w-[140px] sm:w-[160px]"
          >
            <Card
              className={`group relative overflow-hidden p-0 ${
                onImageClick ? "cursor-pointer hover:ring-2 hover:ring-primary" : ""
              }`}
              onClick={() => onImageClick?.(image)}
            >
              <div className="relative w-full overflow-hidden bg-gray-100">
                <Image
                  src={image.image_url}
                  alt={image.prompt || "生成画像"}
                  width={800}
                  height={800}
                  className="w-full h-auto object-contain"
                  sizes="140px"
                />
                {image.is_posted && image.id && (
                  <Link
                    href={`/posts/${image.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0"
                  >
                    <span className="sr-only">投稿詳細を見る</span>
                  </Link>
                )}
                {image.is_posted && (
                  <div className="absolute top-1 right-1 rounded bg-primary px-1.5 py-0.5 text-xs text-white">
                    投稿済み
                  </div>
                )}
              </div>
            </Card>
          </div>
        ))}
        {hasMore && <div ref={loadMoreRef} className="h-1 w-px flex-shrink-0" />}
      </div>
    </div>
  );
}

