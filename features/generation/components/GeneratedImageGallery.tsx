"use client";

import { useState } from "react";
import { Loader2, Download, ZoomIn, Plus } from "lucide-react";
import Masonry from "react-masonry-css";
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

/**
 * URLからファイル名を抽出
 * 例: https://...supabase.co/storage/.../1766523926783-c2p76akbrgw.jpeg
 *     -> 1766523926783-c2p76akbrgw.jpeg
 */
function extractFileNameFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.split('/').pop();
    return fileName && fileName.includes('.') ? fileName : null;
  } catch {
    return null;
  }
}

/**
 * Content-Dispositionヘッダーからファイル名を抽出（将来の拡張性のため）
 * 例: attachment; filename="image.jpeg"
 */
function extractFileNameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (filenameMatch && filenameMatch[1]) {
    // クォートを除去
    return filenameMatch[1].replace(/['"]/g, '');
  }
  return null;
}

/**
 * MIMEタイプから拡張子を取得
 * image/jpg は非標準だが、image/jpeg として扱う
 */
function getExtensionFromMimeType(mimeType: string): string {
  // image/jpg を image/jpeg に正規化
  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return mimeToExt[normalizedMime] || 'png';
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

  const handleDownload = async (image: GeneratedImageData) => {
    if (onDownload) {
      onDownload(image);
      return;
    }

    try {
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
      // blob.typeはBlobオブジェクトが持つMIMEタイプで、より信頼性が高い
      const mimeType = blob.type || response.headers.get('content-type') || 'image/png';
      
      // ファイル名の取得順序: Content-Disposition > URL抽出 > MIMEタイプから推測
      const fileNameFromDisposition = extractFileNameFromContentDisposition(
        response.headers.get('content-disposition')
      );
      const fileNameFromUrl = extractFileNameFromUrl(image.url);
      
      // ファイル名を決定
      let downloadFileName: string;
      if (fileNameFromDisposition) {
        // Content-Dispositionヘッダーが最優先
        downloadFileName = fileNameFromDisposition;
      } else if (fileNameFromUrl) {
        // URLから抽出したファイル名
        downloadFileName = fileNameFromUrl;
      } else {
        // MIMEタイプから拡張子を推測
        const extension = getExtensionFromMimeType(mimeType);
        downloadFileName = `generated-${image.id}.${extension}`;
      }
      
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
      // requestAnimationFrameを使用して、ブラウザの描画サイクル後に確実に解放
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
        <Masonry
          breakpointCols={{
            default: 4,
            1024: 2,
            640: 2,
          }}
          className="flex -ml-4 w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {images.map((image, index) => (
            <div key={image.id} className="mb-4">
              <Card
                className="group relative overflow-hidden p-0 sm:cursor-default cursor-pointer"
                onClick={(e) => {
                  // モバイルのみ: カードタップで拡大モーダルを開く
                  // PCではボタンが表示されるので、カードクリックは無効
                  if (typeof window !== 'undefined' && window.innerWidth < 640) {
                    setSelectedImageIndex(index);
                  }
                }}
              >
                <div className="relative w-full overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`生成画像 ${index + 1}`}
                    className="w-full h-auto object-contain"
                  />
                </div>
                
                {/* PC用: ホバー時にボタン表示 */}
                <div 
                  className="hidden sm:block absolute inset-0 bg-black/0 transition-all group-hover:bg-black/50"
                  onClick={(e) => {
                    // ボタンエリア全体でイベント伝播を止める
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
                        setPostModalImageId(image.id);
                      }}
                    >
                      <Plus className="h-4 w-4" />
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
          ))}
        </Masonry>
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

