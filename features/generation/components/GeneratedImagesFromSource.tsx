"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const ITEMS_PER_PAGE = 10;

export function GeneratedImagesFromSource({
  stockId,
  storagePath,
  onImageClick,
  className,
}: GeneratedImagesFromSourceProps) {
  const [images, setImages] = useState<GeneratedImageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "生成画像の取得に失敗しました";
        setError(errorMessage);
        console.error("Failed to load generated images:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadImages();
  }, [stockId, storagePath]);

  if (!stockId && !storagePath) {
    return null;
  }

  const displayedImages = showAll ? images : images.slice(0, ITEMS_PER_PAGE);
  const hasMore = images.length > ITEMS_PER_PAGE;

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
        {hasMore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(!showAll)}
            className="h-8 text-xs"
          >
            {showAll ? (
              <>
                <ChevronUp className="mr-1 h-3 w-3" />
                折りたたむ
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-3 w-3" />
                すべて表示 ({images.length}件)
              </>
            )}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {displayedImages.map((image) => (
          <Card
            key={image.id}
            className={`group relative overflow-hidden ${
              onImageClick ? "cursor-pointer hover:ring-2 hover:ring-primary" : ""
            }`}
            onClick={() => onImageClick?.(image)}
          >
            <div className="relative aspect-square">
              <Image
                src={image.image_url}
                alt={image.prompt || "生成画像"}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
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
            </div>
            {image.is_posted && (
              <div className="absolute top-1 right-1 rounded bg-primary px-1.5 py-0.5 text-xs text-white">
                投稿済み
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

