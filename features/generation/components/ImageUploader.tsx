"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  validateImageFile,
  DEFAULT_IMAGE_CONFIG,
} from "../lib/validation";
import type { ImageUploadConfig, UploadedImage } from "../types";
import NextImage from "next/image";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCardClick = () => {
    if (!uploadedImage && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={className}>
      <Label htmlFor="image-upload" className="text-base font-medium">
        人物画像をアップロード
      </Label>

      {error && (
        <Alert variant="destructive" className="mt-2">
          <div className="col-start-2 text-sm text-destructive/90 whitespace-normal">
            {error}
          </div>
        </Alert>
      )}

      {!uploadedImage ? (
        <Card
          className={`mt-3 relative overflow-hidden w-full h-[210px] sm:h-[240px] border-2 border-dashed transition-colors p-0 ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-gray-300 hover:border-gray-400"
          } cursor-pointer`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleCardClick}
        >
          <div className="relative h-[210px] sm:h-[240px] flex flex-col items-center justify-center p-4">
            <Upload className="mb-2 h-8 w-8 text-gray-400" />
            <p className="text-xs font-medium text-center text-gray-700">
              画像を追加
            </p>
          </div>
          <input
            ref={fileInputRef}
            id="image-upload"
            type="file"
            accept={config.allowedFormats.join(",")}
            onChange={handleInputChange}
            className="hidden"
          />
        </Card>
      ) : (
        <Card className="relative mt-3 w-full h-[210px] sm:h-[240px] overflow-hidden p-0">
          <div className="relative w-full h-full overflow-hidden bg-gray-100">
            <NextImage
              src={uploadedImage.previewUrl}
              alt="アップロードされた画像"
              width={800}
              height={800}
              className="w-full h-full object-contain"
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
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

