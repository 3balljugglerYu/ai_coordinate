"use client";

import { useState } from "react";
import { Loader2, Download, ZoomIn, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostModal } from "@/features/posts/components/PostModal";
import type { GeneratedImageData } from "../types";
import { ImageModal } from "./ImageModal";

interface GeneratedImageGalleryProps {
  images: GeneratedImageData[];
  isGenerating?: boolean;
  generatingCount?: number;
  completedCount?: number;
  onDownload?: (image: GeneratedImageData) => void;
}

export function GeneratedImageGallery({
  images,
  isGenerating = false,
  generatingCount = 0,
  completedCount = 0,
  onDownload,
}: GeneratedImageGalleryProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [postModalImageId, setPostModalImageId] = useState<string | null>(null);

  const handleDownload = (image: GeneratedImageData) => {
    if (onDownload) {
      onDownload(image);
    } else {
      // デフォルトのダウンロード処理
      const link = document.createElement("a");
      link.href = image.url;
      link.download = `generated-${image.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-4">
      {isGenerating && (
        <Card className="border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                画像を生成中...
              </p>
              <p className="text-xs text-blue-700">
                {completedCount} / {generatingCount} 枚完了
              </p>
            </div>
          </div>
        </Card>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <Card
              key={image.id}
              className="group relative overflow-hidden"
            >
              <div className="relative flex min-h-[200px] items-center justify-center bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={`生成画像 ${index + 1}`}
                  className="h-auto w-full max-h-[300px] object-contain"
                />
              </div>
              
              <div className="absolute inset-0 bg-black/0 transition-all group-hover:bg-black/50">
                <div className="flex h-full items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedImageIndex(index)}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setPostModalImageId(image.id)}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownload(image)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-xs font-medium text-white">
                  画像 {index + 1}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedImageIndex !== null && (
        <ImageModal
          images={images}
          initialIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
          onDownload={handleDownload}
        />
      )}

      {/* 投稿モーダル */}
      {postModalImageId && (
        <PostModal
          open={!!postModalImageId}
          onOpenChange={(open) => {
            if (!open) setPostModalImageId(null);
          }}
          imageId={postModalImageId}
        />
      )}

      {!isGenerating && images.length === 0 && (
        <Card className="border-dashed p-12">
          <p className="text-center text-sm text-gray-500">
            生成された画像がここに表示されます
          </p>
        </Card>
      )}
    </div>
  );
}

