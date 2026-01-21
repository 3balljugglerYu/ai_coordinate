"use client";

import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeneratedImageData } from "../types";
import { determineFileName } from "@/lib/utils";

interface ImageModalProps {
  images: GeneratedImageData[];
  initialIndex: number;
  onClose: () => void;
  onDownload?: (image: GeneratedImageData) => void;
  onPost?: (image: GeneratedImageData) => void;
}


export function ImageModal({
  images,
  initialIndex,
  onClose,
  onDownload,
  onPost,
}: ImageModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;

  const isMobile = () => {
    if (typeof navigator === "undefined") return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  };

  // キーボードナビゲーション
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasMultipleImages) {
        handlePrevious();
      } else if (e.key === "ArrowRight" && hasMultipleImages) {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, hasMultipleImages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  // タッチイベント（スワイプ）
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0]?.clientX ?? null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0]?.clientX ?? null);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd || !hasMultipleImages) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrevious();
    }
  };

  const handleDownload = async () => {
    if (onDownload) {
      onDownload(currentImage);
      return;
    }

    try {
      // 画像をfetchで取得
      const response = await fetch(currentImage.url);
      
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
        currentImage.url,
        currentImage.id,
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
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 100);
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      alert(error instanceof Error ? error.message : "画像のダウンロードに失敗しました");
    }
  };

  const handleShareMobile = async () => {
    try {
      // 画像をfetch（CORS対応）
      const res = await fetch(currentImage.url, { mode: "cors" });
      
      // 認証エラーのハンドリング（401/403）
      if (res.status === 401 || res.status === 403) {
        throw new Error('画像へのアクセス権限がありません。認証が必要な可能性があります。');
      }
      
      if (!res.ok) {
        throw new Error(`画像の取得に失敗しました: ${res.statusText}`);
      }
      
      // Blobに変換
      const blob = await res.blob();
      
      // MIMEタイプの取得（handleDownloadと同じロジック）
      const mimeType = blob.type || res.headers.get('content-type') || 'image/png';
      
      // ファイル名を決定（共通ロジックを使用）
      const fileName = determineFileName(
        res,
        currentImage.url,
        currentImage.id,
        mimeType
      );
      
      // Fileオブジェクトを作成
      const file = new File(
        [blob],
        fileName,
        { type: mimeType }
      );
      
      // Web Share API Level 2（files）のサポート確認
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Persta.AI",
        });
        return;
      }
      
      // フォールバック: 通常のダウンロード
      await handleDownload();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      // キャンセルやジェスチャー不足は無視
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        message.includes("user gesture") ||
        message.includes("share request")
      ) {
        return;
      }
      console.error("Share Sheet失敗:", error);
      // エラー時もダウンロードにフォールバック
      await handleDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      {/* ヘッダー */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <div className="text-sm font-medium text-white">
          {currentIndex + 1} / {images.length}
        </div>
        <div className="flex items-center gap-2">
          {onPost && !currentImage.is_posted && (
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={() => onPost(currentImage)}
            >
              <Plus className="h-5 w-5" />
              <span className="ml-1">投稿</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={() => {
              if (isMobile()) {
                handleShareMobile();
              } else {
                handleDownload();
              }
            }}
          >
            <Download className="h-5 w-5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 画像 */}
      <div
        className="relative h-full w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentImage.url}
          alt={`生成画像 ${currentIndex + 1}`}
          className="h-full w-full object-contain p-4"
        />
      </div>

      {/* ナビゲーションボタン */}
      {hasMultipleImages && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            onClick={handlePrevious}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            onClick={handleNext}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}

      {/* インジケーター */}
      {hasMultipleImages && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          {images.map((_, index) => (
            <button
              key={index}
              className={`h-2 w-2 rounded-full transition-all ${
                index === currentIndex
                  ? "w-6 bg-white"
                  : "bg-white/50 hover:bg-white/75"
              }`}
              onClick={() => setCurrentIndex(index)}
              aria-label={`画像 ${index + 1} に移動`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
