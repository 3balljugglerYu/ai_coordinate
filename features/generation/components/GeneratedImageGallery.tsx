"use client";

import { useState, useEffect } from "react";
import { Download, ZoomIn, Plus } from "lucide-react";
import Masonry from "react-masonry-css";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostModal } from "@/features/posts/components/PostModal";
import type { GeneratedImageData } from "../types";
import { ImageModal } from "./ImageModal";
import { determineFileName } from "@/lib/utils";

interface GeneratedImageGalleryProps {
  images: GeneratedImageData[];
  isGenerating?: boolean;
  generatingCount?: number;
  completedCount?: number;
  onDownload?: (image: GeneratedImageData) => void;
}

const FALLBACK_SHOW_DELAY_MS = 800;

export function GeneratedImageGallery({
  images,
  isGenerating = false,
  generatingCount = 0,
  completedCount = 0,
  onDownload,
}: GeneratedImageGalleryProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [postModalImageId, setPostModalImageId] = useState<string | null>(null);
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set());

  const handleImageLoad = (imageId: string) => {
    setLoadedImageIds((prev) => new Set(prev).add(imageId));
  };

  // onLoad が発火しない場合のフォールバック（キャッシュ済み・ネットワーク遅延等）
  useEffect(() => {
    const timeouts = images.map((img) =>
      setTimeout(() => {
        setLoadedImageIds((prev) =>
          prev.has(img.id) ? prev : new Set(prev).add(img.id)
        );
      }, FALLBACK_SHOW_DELAY_MS)
    );
    return () => timeouts.forEach(clearTimeout);
  }, [images]);

  // チュートリアルStep11（PC）時は投稿・ダウンロードボタンを無効化
  const [disablePostAndDownload, setDisablePostAndDownload] = useState(false);
  useEffect(() => {
    const check = () => {
      const isStep11 =
        typeof document !== "undefined" &&
        document.body.hasAttribute("data-tour-step-first-image");
      const isPC = typeof window !== "undefined" && window.innerWidth >= 640;
      setDisablePostAndDownload(Boolean(isStep11 && isPC));
    };
    check();
    const handler = () => check();
    window.addEventListener("resize", handler);
    document.addEventListener("tutorial:step-11-changed", handler);
    return () => {
      window.removeEventListener("resize", handler);
      document.removeEventListener("tutorial:step-11-changed", handler);
    };
  }, []);

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
      {/* 生成中表示は GenerationFormContainer で一元管理（重複を避ける） */}
      {(images.length > 0 || (isGenerating && generatingCount > 0)) && (
        <Masonry
          breakpointCols={{
            default: 4,
            1024: 2,
            640: 2,
          }}
          className="flex -ml-4 w-auto"
          columnClassName="pl-4 bg-clip-padding"
        >
          {/* 生成中: 生成予定枚数分のスケルトンを表示（画像サイズは事前把握可能なため） */}
          {isGenerating &&
            generatingCount > 0 &&
            Array.from({ length: generatingCount }).map((_, i) => (
              <div key={`skeleton-${i}`} className="mb-4">
                <div className="overflow-hidden rounded-lg border bg-gray-100">
                  <div className="aspect-square w-full animate-pulse bg-gray-200" />
                </div>
              </div>
            ))}
          {images.map((image, index) => (
            <div
              key={image.id}
              className="mb-4"
              {...(index === 0 ? { "data-tour": "tour-first-image" } : {})}
            >
              <Card
                className="group relative overflow-hidden p-0 sm:cursor-default cursor-pointer"
                onClick={(e) => {
                  // チュートリアルStep11中はクリック無効（モーダルを開かない）
                  if (
                    index === 0 &&
                    document.body.hasAttribute("data-tour-step-first-image")
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  // モバイルのみ: カードタップで拡大モーダルを開く
                  // PCではボタンが表示されるので、カードクリックは無効
                  if (typeof window !== 'undefined' && window.innerWidth < 640) {
                    setSelectedImageIndex(index);
                  }
                }}
              >
                <div className="relative w-full overflow-hidden bg-gray-100">
                  {/* 画像ロード完了までスケルトン表示（ブロック要素で高さを確保し空白を防ぐ） */}
                  {!loadedImageIds.has(image.id) && (
                    <div
                      className="aspect-square w-full animate-pulse bg-gray-200"
                      aria-hidden
                    />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`生成画像 ${index + 1}`}
                    className={`block object-contain transition-opacity duration-200 ${
                      loadedImageIds.has(image.id)
                        ? "relative w-full h-auto opacity-100"
                        : "absolute inset-0 h-full w-full opacity-0"
                    }`}
                    onLoad={() => handleImageLoad(image.id)}
                    ref={(el) => {
                      if (
                        el?.complete &&
                        el.naturalHeight > 0 &&
                        !loadedImageIds.has(image.id)
                      ) {
                        queueMicrotask(() => handleImageLoad(image.id));
                      }
                    }}
                  />
                  {image.is_posted && (
                    image.id ? (
                      <Link
                        href={`/posts/${encodeURIComponent(image.id)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-1 right-1 z-10"
                      >
                        <div className="rounded bg-primary px-1.5 py-0.5 text-xs text-white">
                          投稿済み
                        </div>
                      </Link>
                    ) : (
                      <div className="absolute top-1 right-1 z-10 rounded bg-primary px-1.5 py-0.5 text-xs text-white">
                        投稿済み
                      </div>
                    )
                  )}
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
                      disabled={
                        index === 0 &&
                        typeof document !== "undefined" &&
                        document.body.hasAttribute("data-tour-step-first-image")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        // チュートリアルStep11中はクリック無効
                        if (
                          index === 0 &&
                          document.body.hasAttribute("data-tour-step-first-image")
                        ) {
                          return;
                        }
                        setSelectedImageIndex(index);
                      }}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    {!image.is_posted && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={disablePostAndDownload}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPostModalImageId(image.id);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="ml-1">投稿</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disablePostAndDownload}
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
          onPost={(image) => {
            setPostModalImageId(image.id);
            setSelectedImageIndex(null);
          }}
          disablePostAndDownload={disablePostAndDownload}
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
