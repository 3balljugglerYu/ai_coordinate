"use client";

import { useCallback, useState, useEffect } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  validateImageFile,
  DEFAULT_IMAGE_CONFIG,
  getReadableFileFormat,
} from "../lib/validation";
import {
  getStockImageLimit,
  getCurrentStockImageCount,
} from "../lib/database";
import type { ImageUploadConfig, UploadedImage } from "../types";
import NextImage from "next/image";

interface StockImageUploaderProps {
  onUploadSuccess?: (stockId: string) => void;
  onUploadError?: (error: string) => void;
  config?: ImageUploadConfig;
  className?: string;
}

export function StockImageUploader({
  onUploadSuccess,
  onUploadError,
  config = DEFAULT_IMAGE_CONFIG,
  className,
}: StockImageUploaderProps) {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stockLimit, setStockLimit] = useState<number | null>(null);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const t = useTranslations("coordinate");

  // ストック画像制限数を取得
  useEffect(() => {
    const fetchLimit = async () => {
      try {
        const limit = await getStockImageLimit();
        const count = await getCurrentStockImageCount();
        setStockLimit(limit);
        setCurrentCount(count);
      } catch (err) {
        console.error("Failed to fetch stock limit:", err);
      }
    };
    fetchLimit();
  }, []);

  // コンポーネントのアンマウント時にpreviewUrlをクリーンアップ
  useEffect(() => {
    return () => {
      if (uploadedImage?.previewUrl) {
        URL.revokeObjectURL(uploadedImage.previewUrl);
      }
    };
  }, [uploadedImage?.previewUrl]);

  const handleFileChange = useCallback(
    async (file: File) => {
      setError(null);

      const result = await validateImageFile(file, config, {
        imageLoadFailed: t("imageLoadFailed"),
        invalidFileFormat: (formats) => t("invalidFileFormat", { formats }),
        fileTooLarge: (maxSizeMB, currentSizeMB) =>
          t("fileTooLarge", { maxSizeMB, currentSizeMB }),
        imageValidationFailed: t("imageValidationFailed"),
      });

      if (!result.isValid) {
        const errorMsg = result.error || t("imageValidationFailed");
        setError(errorMsg);
        onUploadError?.(errorMsg);
        return;
      }

      // 画像の寸法を取得
      const img = new Image();
      img.onload = () => {
        // 表示用の新しいpreviewUrlを生成
        const displayPreviewUrl = URL.createObjectURL(file);
        
        const uploadedImg: UploadedImage = {
          file,
          previewUrl: displayPreviewUrl,
          width: img.width,
          height: img.height,
        };
        setUploadedImage(uploadedImg);
        
        // バリデーション用のpreviewUrlは解放
        URL.revokeObjectURL(result.previewUrl!);
      };
      img.src = result.previewUrl!;
    },
    [config, onUploadError, t]
  );

  const handleUpload = useCallback(async () => {
    if (!uploadedImage) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadedImage.file);

      const res = await fetch("/api/source-image-stocks", {
        method: "POST",
        body: formData,
      });

      // 認証エラー時はリダイレクトでHTMLが返る可能性がある
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("text/html")) {
        throw new Error(t("loginRequired"));
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t("stockUploadFailed"));
      }

      // 成功時の処理
      setUploadedImage(null);
      setCurrentCount((prev) => (prev !== null ? prev + 1 : null));
      onUploadSuccess?.(data.id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("stockUploadFailed");

      setError(errorMessage);
      onUploadError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  }, [onUploadError, onUploadSuccess, t, uploadedImage]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleFileChange(file);
    } else {
      const errorMsg = t("dropImageFile");
      setError(errorMsg);
      onUploadError?.(errorMsg);
    }
  };

  const handleRemove = () => {
    if (uploadedImage?.previewUrl) {
      URL.revokeObjectURL(uploadedImage.previewUrl);
    }
    setUploadedImage(null);
    setError(null);
  };

  const isLimitReached = stockLimit !== null && currentCount !== null && currentCount >= stockLimit;

  return (
    <div className={className}>
      {(stockLimit !== null && currentCount !== null) && (
        <div className="flex items-center justify-end mb-2">
          <span className="text-xs text-gray-500">
            {t("stockCountStatus", { current: currentCount, limit: stockLimit })}
          </span>
        </div>
      )}

      {isLimitReached && (
        <Alert variant="destructive" className="mt-2 mb-3">
          <AlertDescription>
            {t("stockLimitReachedDescription")}
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!uploadedImage ? (
        <Card
          className={`mt-3 border-2 border-dashed transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-gray-400"
          } ${isLimitReached ? "opacity-50 cursor-not-allowed" : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <label
            htmlFor="stock-image-upload"
            className={`flex cursor-pointer flex-col items-center justify-center py-12 px-6 ${
              isLimitReached ? "cursor-not-allowed" : ""
            }`}
          >
            <Upload className={`mb-4 h-12 w-12 ${isLimitReached ? "text-gray-300" : "text-gray-400"}`} />
            <p className={`mb-2 text-sm font-medium ${isLimitReached ? "text-gray-400" : "text-gray-700"}`}>
              {isLimitReached
                ? t("stockLimitReachedPrompt")
                : t("stockUploadPrompt")}
            </p>
            {!isLimitReached && (
              <>
                <p className="text-xs text-gray-500">
                  {t("stockSupportedFormats", {
                    formats: getReadableFileFormat(config.allowedFormats),
                  })}
                </p>
                <p className="text-xs text-gray-500">
                  {t("stockMaxSize", { size: config.maxSizeMB })}
                </p>
              </>
            )}
            <input
              id="stock-image-upload"
              type="file"
              accept={config.allowedFormats.join(",")}
              onChange={handleInputChange}
              className="hidden"
              disabled={isLimitReached}
            />
          </label>
        </Card>
      ) : (
        <Card className="relative mt-3 overflow-hidden">
          <div className="relative flex items-center justify-center bg-gray-100 w-full max-w-[200px] max-h-[200px] aspect-square mx-auto overflow-hidden">
            <NextImage
              src={uploadedImage.previewUrl}
              alt={t("uploadedImageAlt")}
              width={uploadedImage.width}
              height={uploadedImage.height}
              className="h-full w-full object-contain"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={handleRemove}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 p-3 bg-gray-50 text-xs text-gray-600">
            <ImageIcon className="h-4 w-4" />
            <span>
              {uploadedImage.file.name} ({uploadedImage.width} × {uploadedImage.height}
              px)
            </span>
          </div>
          <div className="p-3 border-t">
            <Button
              type="button"
              className="w-full"
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("stockUploading")}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t("stockSaveAction")}
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
