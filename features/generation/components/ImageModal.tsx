"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GeneratedImageData } from "../types";
import { determineFileName } from "@/lib/utils";
import { fetchBeforeSourceUrl } from "@/features/posts/lib/api";
import { useFullscreenImageGestures } from "../hooks/useFullscreenImageGestures";

interface ImageModalProps {
  images: GeneratedImageData[];
  initialIndex: number;
  /**
   * 閉じる契機。close 時に表示していた画像が保存促進などで必要な場合があるため、
   * 該当 image を引数で渡す（後方互換のため引数省略でも呼び出せる）。
   */
  onClose: (image?: GeneratedImageData) => void;
  onDownload?: (image: GeneratedImageData) => void;
  onPost?: (image: GeneratedImageData) => void;
  /** チュートリアルStep11（PC）時に投稿・ダウンロードを無効化 */
  disablePostAndDownload?: boolean;
}


export function ImageModal({
  images,
  initialIndex,
  onClose,
  onDownload,
  onPost,
  disablePostAndDownload = false,
}: ImageModalProps) {
  const t = useTranslations("coordinate");
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showBefore, setShowBefore] = useState(false);
  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(null);

  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;
  const displayedImageUrl =
    showBefore && beforeImageUrl ? beforeImageUrl : currentImage?.url;

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // 全画面ビューワー共通のジェスチャ（ピンチ・ドラッグパン・ダブルタップ・
  // ホイール・横スワイプ・下スワイプで閉じる）を hook で適用する。
  // /posts/[id] の ImageFullscreen と同じ挙動。
  const { imageStyle, containerHandlers, reset: resetGestures } =
    useFullscreenImageGestures({
      hasMultiple: hasMultipleImages,
      onClose: () => onClose(currentImage),
      onSwipePrev: handlePrevious,
      onSwipeNext: handleNext,
    });

  // 画像を切り替える際は拡大状態をリセットして元のサイズで表示する
  const goToIndex = useCallback(
    (newIndex: number) => {
      setCurrentIndex(newIndex);
      resetGestures();
    },
    [resetGestures],
  );

  // モーダル表示中は背景（コーディネート画面）のスクロールを無効化する。
  // 元の overflow を保存して復元することで、他モーダルとの干渉を避ける。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // 表示画像が切り替わるたびに Before/After を After にリセットし、
  // 該当画像の Before 画像 URL を取得する（取得不可の場合はトグル非表示）。
  useEffect(() => {
    setShowBefore(false);
    setBeforeImageUrl(null);
    if (!currentImage?.id || currentImage.isPreview) return;
    let cancelled = false;
    fetchBeforeSourceUrl(currentImage.id).then((url) => {
      if (!cancelled) setBeforeImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentImage?.id, currentImage?.isPreview]);

  const isMobile = () => {
    if (typeof navigator === "undefined") return false;
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  };

  // キーボードナビゲーション
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose(currentImage);
      } else if (e.key === "ArrowLeft" && hasMultipleImages) {
        handlePrevious();
        resetGestures();
      } else if (e.key === "ArrowRight" && hasMultipleImages) {
        handleNext();
        resetGestures();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentImage, currentIndex, hasMultipleImages, handlePrevious, handleNext, resetGestures, onClose]);

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
        throw new Error(t("imageAccessDenied"));
      }
      
      if (!response.ok) {
        throw new Error(
          t("imageFetchFailed", { statusText: response.statusText })
        );
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
      alert(
        error instanceof Error ? error.message : t("imageDownloadFailed")
      );
    }
  };

  const handleShareMobile = async () => {
    try {
      // 画像をfetch（CORS対応）
      const res = await fetch(currentImage.url, { mode: "cors" });
      
      // 認証エラーのハンドリング（401/403）
      if (res.status === 401 || res.status === 403) {
        throw new Error(t("imageAccessDenied"));
      }
      
      if (!res.ok) {
        throw new Error(
          t("imageFetchFailed", { statusText: res.statusText })
        );
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      {...containerHandlers}
    >
      {/* ヘッダー */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-end p-4">
        <div className="flex items-center gap-2">
          {beforeImageUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20"
              onClick={() => {
                setShowBefore((prev) => !prev);
                resetGestures();
              }}
              aria-pressed={showBefore}
            >
              <ArrowLeftRight className="h-5 w-5" />
              <span className="ml-1">
                {showBefore ? t("modalBeforeLabel") : t("modalAfterLabel")}
              </span>
            </Button>
          )}
          {onPost && !currentImage.is_posted && !currentImage.isPreview && (
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/20"
              disabled={disablePostAndDownload}
              onClick={() => onPost(currentImage)}
            >
              <Plus className="h-5 w-5" />
              <span className="ml-1">{t("postAction")}</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/20"
            disabled={disablePostAndDownload}
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
            data-tour="tour-modal-close"
            onClick={() => {
              if (
                typeof document !== "undefined" &&
                document.body.hasAttribute("data-tour-in-progress")
              ) {
                document.dispatchEvent(new CustomEvent("tutorial:modal-closed"));
              }
              onClose(currentImage);
            }}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 画像 */}
      <div
        className="relative flex h-full w-full items-center justify-center"
        data-tour="tour-modal-content"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayedImageUrl}
          alt={t("generatedImageAltIndexed", { index: currentIndex + 1 })}
          className="h-full w-full object-contain p-4"
          style={{ ...imageStyle, userSelect: "none" }}
          draggable={false}
        />
      </div>

      {/* ナビゲーションボタン */}
      {hasMultipleImages && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevious();
              resetGestures();
            }}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
              resetGestures();
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                goToIndex(index);
              }}
              aria-label={t("goToImage", { index: index + 1 })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
