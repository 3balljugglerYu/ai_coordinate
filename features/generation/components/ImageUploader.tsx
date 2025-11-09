"use client";

import { useCallback, useState, useEffect } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import {
  validateImageFile,
  DEFAULT_IMAGE_CONFIG,
  getReadableFileFormat,
} from "../lib/validation";
import type { ImageUploadConfig, UploadedImage } from "../types";

interface ImageUploaderProps {
  onImageUpload: (image: UploadedImage) => void;
  onImageRemove?: () => void;
  config?: ImageUploadConfig;
  className?: string;
}

export function ImageUploader({
  onImageUpload,
  onImageRemove,
  config = DEFAULT_IMAGE_CONFIG,
  className,
}: ImageUploaderProps) {
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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
        setError(result.error || "画像の検証に失敗しました");
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
        onImageUpload(uploadedImg);
        
        // バリデーション用のpreviewUrlは解放
        URL.revokeObjectURL(result.previewUrl!);
      };
      img.src = result.previewUrl!;
    },
    [config, onImageUpload]
  );

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
      setError("画像ファイルをドロップしてください");
    }
  };

  const handleRemove = () => {
    if (uploadedImage?.previewUrl) {
      URL.revokeObjectURL(uploadedImage.previewUrl);
    }
    setUploadedImage(null);
    setError(null);
    onImageRemove?.();
  };

  return (
    <div className={className}>
      <Label htmlFor="image-upload" className="text-base font-medium">
        人物画像をアップロード
      </Label>

      {error && (
        <Alert variant="destructive" className="mt-2">
          <p className="text-sm">{error}</p>
        </Alert>
      )}

      {!uploadedImage ? (
        <Card
          className={`mt-3 border-2 border-dashed transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-gray-400"
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <label
            htmlFor="image-upload"
            className="flex cursor-pointer flex-col items-center justify-center py-12 px-6"
          >
            <Upload className="mb-4 h-12 w-12 text-gray-400" />
            <p className="mb-2 text-sm font-medium text-gray-700">
              クリックまたはドラッグ&ドロップで画像をアップロード
            </p>
            <p className="text-xs text-gray-500">
              対応形式: {getReadableFileFormat(config.allowedFormats)}
            </p>
            <p className="text-xs text-gray-500">
              最大サイズ: {config.maxSizeMB}MB
            </p>
            <input
              id="image-upload"
              type="file"
              accept={config.allowedFormats.join(",")}
              onChange={handleInputChange}
              className="hidden"
            />
          </label>
        </Card>
      ) : (
        <Card className="relative mt-3 overflow-hidden">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uploadedImage.previewUrl}
              alt="アップロードされた画像"
              className="w-full h-auto max-h-[400px] object-contain"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2"
              onClick={handleRemove}
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
        </Card>
      )}
    </div>
  );
}

