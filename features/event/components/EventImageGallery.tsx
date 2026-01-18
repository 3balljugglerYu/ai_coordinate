"use client";

import { useState } from "react";
import { Download, ZoomIn } from "lucide-react";
import Masonry from "react-masonry-css";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EventImageData } from "../types";
import { ImageModal } from "@/features/generation/components/ImageModal";
import { determineFileName } from "@/lib/utils";
import { validateImageUrl } from "../lib/url-validation";

interface EventImageGalleryProps {
  images: EventImageData[];
  onDownload?: (image: EventImageData) => void;
}

export function EventImageGallery({
  images,
  onDownload,
}: EventImageGalleryProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const handleDownload = async (image: EventImageData) => {
    if (onDownload) {
      onDownload(image);
      return;
    }

    try {
      // URLの検証（セキュリティ対策）
      validateImageUrl(image.url);

      // 画像をfetchで取得
      const response = await fetch(image.url);
      
      // 認証エラーのハンドリング（401/403）
      if (response.status === 401 || response.status === 403) {
        throw new Error('画像へのアクセス権限がありません。認証が必要な可能性があります。');
      }
      
      if (!response.ok) {
        throw new Error(`画像の取得に失敗しました: ${response.statusText}`);
      }
      
      // Blobに変換（MIMEタイプを保持）
      const blob = await response.blob();
      
      // MIMEタイプの取得順序: blob.type を優先、次にContent-Typeヘッダー、最後にデフォルト
      const mimeType = blob.type || response.headers.get('content-type') || 'image/png';
      
      // ファイル名を決定（共通ロジックを使用）
      const downloadFileName = determineFileName(
        response,
        image.url,
        image.id,
        mimeType
      );
      
      // ObjectURLを作成
      const objectUrl = URL.createObjectURL(blob);
      
      // ダウンロードリンクを作成
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // メモリリークを防ぐためにObjectURLを解放
      requestAnimationFrame(() => {
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
        }, 100);
      });
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      alert(error instanceof Error ? error.message : "画像のダウンロードに失敗しました");
    }
  };

  // EventImageDataをGeneratedImageData形式に変換（ImageModal用）
  const convertToGeneratedImageData = (image: EventImageData) => {
    return {
      id: image.id,
      url: image.url,
      is_posted: image.is_posted,
    };
  };

  // 投稿レコードからEventImageDataを取得（画像URL取得用）
  const getImageUrl = (image: EventImageData): string => {
    // EventImageDataには直接urlがあるので、そのまま使用
    return image.url;
  };

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <Masonry
          breakpointCols={{
            default: 4,
            1024: 2,
            640: 2,
          }}
          className="flex -ml-4 w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {images.map((image, index) => {
            const imageUrl = getImageUrl(image);
            return (
              <div key={image.id} className="mb-4">
                <Card
                  className="group relative overflow-hidden p-0 sm:cursor-default cursor-pointer"
                  onClick={(e) => {
                    // モバイルのみ: カードタップで拡大モーダルを開く
                    if (typeof window !== 'undefined' && window.innerWidth < 640) {
                      setSelectedImageIndex(index);
                    }
                  }}
                >
                  <div className="relative w-full overflow-hidden bg-gray-100">
                    <Image
                      src={imageUrl}
                      alt={`イラスト素材 ${index + 1}`}
                      width={800}
                      height={800}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
                      unoptimized
                      className="w-full h-auto object-contain"
                    />
                  </div>
                  
                  {/* PC用: ホバー時にボタン表示 */}
                  <div 
                    className="hidden sm:block absolute inset-0 bg-black/0 transition-all group-hover:bg-black/50"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <div className="flex h-full items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImageIndex(index);
                        }}
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(image);
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </Masonry>
      )}

      {selectedImageIndex !== null && (
        <ImageModal
          images={images.map(convertToGeneratedImageData)}
          initialIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
          onDownload={(img) => {
            const originalImage = images[selectedImageIndex!];
            // handleDownload内でURL検証が行われる
            handleDownload(originalImage);
          }}
          // onPostは渡さない（投稿機能なし）
        />
      )}

      {images.length === 0 && (
        <Card className="border-dashed p-12">
          <p className="text-center text-sm text-gray-500">
            イラスト素材がここに表示されます
          </p>
        </Card>
      )}
    </div>
  );
}
