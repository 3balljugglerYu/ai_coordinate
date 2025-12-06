"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  validateImageFile,
  DEFAULT_IMAGE_CONFIG,
} from "../lib/validation";
import { uploadFileToStorage } from "../lib/storage";
import {
  saveSourceImageStock,
  getStockImageLimit,
  getCurrentStockImageCount,
  StockLimitExceededError,
} from "../lib/database";
import { getCurrentUserId } from "../lib/generation-service";
import type { ImageUploadConfig, UploadedImage } from "../types";
import NextImage from "next/image";

interface StockImageUploadCardProps {
  onUploadSuccess?: (stockId: string) => void;
  onUploadError?: (error: string) => void;
  config?: ImageUploadConfig;
  className?: string;
}

export function StockImageUploadCard({
  onUploadSuccess,
  onUploadError,
  config = DEFAULT_IMAGE_CONFIG,
  className,
}: StockImageUploadCardProps) {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stockLimit, setStockLimit] = useState<number | null>(null);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const result = await validateImageFile(file, config);

      if (!result.isValid) {
        const errorMsg = result.error || "画像の検証に失敗しました";
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
    [config, onUploadError]
  );

  const handleUpload = useCallback(async () => {
    if (!uploadedImage) return;

    setIsUploading(true);
    setError(null);

    try {
      // ユーザーIDを取得
      const userId = await getCurrentUserId();
      if (!userId) {
        throw new Error("ログインが必要です");
      }

      // ストレージにアップロード
      const { path, url } = await uploadFileToStorage(
        uploadedImage.file,
        userId
      );

      // データベースに保存
      const stock = await saveSourceImageStock({
        user_id: userId,
        image_url: url,
        storage_path: path,
        name: uploadedImage.file.name,
      });

      // 成功時の処理
      if (uploadedImage.previewUrl) {
        URL.revokeObjectURL(uploadedImage.previewUrl);
      }
      setUploadedImage(null);
      setCurrentCount((prev) => (prev !== null ? prev + 1 : null));
      onUploadSuccess?.(stock.id);
    } catch (err) {
      let errorMessage = "ストック画像のアップロードに失敗しました";
      
      if (err instanceof StockLimitExceededError) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      onUploadError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  }, [uploadedImage, onUploadSuccess, onUploadError]);

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
      const errorMsg = "画像ファイルをドロップしてください";
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCardClick = () => {
    if (!uploadedImage && !isLimitReached && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const isLimitReached = stockLimit !== null && currentCount !== null && currentCount >= stockLimit;

  // アップロード済み画像を表示する状態
  if (uploadedImage) {
    return (
      <Card className={`relative overflow-hidden w-full p-0 ${className || ""}`}>
        <div className="relative w-full overflow-hidden bg-gray-100">
          <NextImage
            src={uploadedImage.previewUrl}
            alt="アップロードされた画像"
            width={800}
            height={800}
            className="w-full h-auto object-contain"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            disabled={isUploading}
          >
            <X className="h-4 w-4" />
          </Button>
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="p-2">
          <Button
            type="button"
            className="w-full mt-2"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleUpload();
            }}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-3 w-3" />
                保存
              </>
            )}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={config.allowedFormats.join(",")}
          onChange={handleInputChange}
          className="hidden"
          disabled={isLimitReached}
        />
      </Card>
    );
  }

  // アップロードカード（空の状態）
  return (
    <Card
      className={`relative overflow-hidden w-full border-2 border-dashed transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-gray-300 hover:border-gray-400"
      } ${isLimitReached ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className || ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleCardClick}
    >
      <div className="relative aspect-square flex flex-col items-center justify-center p-4">
        <Upload className={`mb-2 h-8 w-8 ${isLimitReached ? "text-gray-300" : "text-gray-400"}`} />
        <p className={`text-xs font-medium text-center ${isLimitReached ? "text-gray-400" : "text-gray-700"}`}>
          {isLimitReached ? "上限に達しています" : "画像を追加"}
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={config.allowedFormats.join(",")}
        onChange={handleInputChange}
        className="hidden"
        disabled={isLimitReached}
      />
    </Card>
  );
}

