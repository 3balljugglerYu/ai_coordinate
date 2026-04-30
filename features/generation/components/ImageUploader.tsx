"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import {
  validateImageFile,
  DEFAULT_IMAGE_CONFIG,
} from "../lib/validation";
import type { ImageUploadConfig, UploadedImage } from "../types";
import NextImage from "next/image";

interface ImageUploaderProps {
  onImageUpload: (image: UploadedImage) => void;
  onImageRemove?: () => void;
  /** 親からプログラム的にセットされた画像（チュートリアル等で使用） */
  value?: UploadedImage | null;
  config?: ImageUploadConfig;
  className?: string;
  label?: string;
  addImageLabel?: string;
  compact?: boolean;
  disabled?: boolean;
  square?: boolean;
  aspectRatio?: number;
  previewObjectFit?: "contain" | "cover";
  filledPreviewMode?: "fixed" | "natural";
}

export function ImageUploader({
  onImageUpload,
  onImageRemove,
  value,
  config = DEFAULT_IMAGE_CONFIG,
  className,
  label,
  addImageLabel,
  compact = false,
  disabled = false,
  square = false,
  aspectRatio,
  previewObjectFit = "contain",
  filledPreviewMode = "fixed",
}: ImageUploaderProps) {
  const t = useTranslations("coordinate");
  const [internalImage, setInternalImage] = useState<UploadedImage | null>(null);
  const uploadedImage = value !== undefined ? value : internalImage;
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 直前の previewUrl と controlled モード状態を ref で追跡する。
  // controlled モード（親から value が渡される）では、unmount 時に URL を
  // revoke すると親が保持する value.previewUrl が無効化され、再 mount 時
  // （タブ切替等）に画像が壊れて見える。controlled では URL のライフサイクル
  // は親が所有する想定で、unmount 時の revoke を抑止する。
  const prevPreviewUrlRef = useRef<string | null>(null);
  const isControlledRef = useRef(value !== undefined);
  isControlledRef.current = value !== undefined;

  // previewUrl が差し変わったタイミングで古い URL を revoke（メモリ解放）。
  useEffect(() => {
    const currentUrl = uploadedImage?.previewUrl ?? null;
    const prevUrl = prevPreviewUrlRef.current;
    if (prevUrl && prevUrl !== currentUrl) {
      URL.revokeObjectURL(prevUrl);
    }
    prevPreviewUrlRef.current = currentUrl;
  }, [uploadedImage?.previewUrl]);

  // 真の unmount 時のみ呼ばれる cleanup（empty deps）。
  // controlled モードでは親が URL を所有するので revoke しない。
  useEffect(() => {
    return () => {
      if (!isControlledRef.current && prevPreviewUrlRef.current) {
        URL.revokeObjectURL(prevPreviewUrlRef.current);
      }
    };
  }, []);

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
        setError(result.error || t("generationFailedGeneric"));
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
        if (value === undefined) {
          setInternalImage(uploadedImg);
        }
        onImageUpload(uploadedImg);
        
        // バリデーション用のpreviewUrlは解放
        URL.revokeObjectURL(result.previewUrl!);
      };
      img.src = result.previewUrl!;
    },
    [config, onImageUpload, value]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    const file = event.target.files?.[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      return;
    }
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      return;
    }
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      return;
    }
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleFileChange(file);
    } else {
      setError(t("dropImageFile"));
    }
  };

  const handleRemove = () => {
    if (disabled) {
      return;
    }
    if (uploadedImage?.previewUrl) {
      URL.revokeObjectURL(uploadedImage.previewUrl);
    }
    setInternalImage(null);
    setError(null);
    onImageRemove?.();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCardClick = () => {
    if (disabled) {
      return;
    }
    if (!uploadedImage && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const labelClassName = compact
    ? "text-xs font-medium leading-none block"
    : "text-base font-medium block";
  const cardSpacingClassName = compact ? "mt-1" : "mt-3";
  const cardSizeClassName =
    compact || square || aspectRatio ? "" : "h-[210px] sm:h-[240px]";
  const emptyCardClassName = `${cardSpacingClassName} relative overflow-hidden w-full ${cardSizeClassName} border-2 border-dashed transition-colors p-0 ${
    isDragging
      ? "border-primary bg-primary/5"
      : "border-gray-300 hover:border-gray-400"
  } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`;
  const filledCardClassName = `relative ${cardSpacingClassName} w-full ${cardSizeClassName} overflow-hidden p-0`;
  const cardInnerClassName =
    compact || square || aspectRatio
      ? "relative flex aspect-square flex-col items-center justify-center p-2"
      : "relative flex h-[210px] flex-col items-center justify-center p-4 sm:h-[240px]";
  const uploadIconClassName = compact
    ? "mb-1 h-5 w-5 text-gray-400"
    : "mb-2 h-8 w-8 text-gray-400";
  const addImageTextClassName = compact
    ? "text-[10px] font-medium leading-tight text-center text-gray-700"
    : "text-xs font-medium text-center text-gray-700";
  const removeButtonClassName = compact
    ? "absolute top-1 right-1 tour-image-cancel-btn"
    : "absolute top-2 right-2 tour-image-cancel-btn";
  const aspectRatioStyle = aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined;
  const cardInnerStyle =
    compact || square
      ? undefined
      : aspectRatioStyle;
  const aspectRatioDataValue = aspectRatio ? String(aspectRatio) : undefined;
  const filledCardStyle =
    filledPreviewMode === "natural" ? undefined : aspectRatioStyle;

  return (
    <div className={className} data-aspect-ratio={aspectRatioDataValue}>
      {/* ラベル + 画像カードをハイライト。キャンセルボタンはチュートリアル中のみ pointer-events: none で無効化 */}
      <div data-tour="tour-image-upload">
        <Label htmlFor="image-upload" className={labelClassName}>
          {label ?? t("uploadSourceLabel")}
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
            className={emptyCardClassName}
            style={aspectRatioStyle}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleCardClick}
          >
            <div className={cardInnerClassName} style={cardInnerStyle}>
              <Upload className={uploadIconClassName} />
              <p className={addImageTextClassName}>
                {addImageLabel ?? t("addImage")}
              </p>
            </div>
            <input
              ref={fileInputRef}
              id="image-upload"
              type="file"
              accept={config.allowedFormats.join(",")}
              onChange={handleInputChange}
              disabled={disabled}
              className="hidden"
            />
          </Card>
        ) : (
          <Card className={filledCardClassName} style={filledCardStyle}>
            <div
              className={`relative w-full overflow-hidden bg-gray-100 ${
                filledPreviewMode === "natural" ? "" : "h-full"
              }`}
            >
              <NextImage
                src={uploadedImage.previewUrl}
                alt={t("uploadedImageAlt")}
                width={uploadedImage.width || 800}
                height={uploadedImage.height || 800}
                className={
                  filledPreviewMode === "natural"
                    ? "block h-auto w-full"
                    : `w-full h-full ${
                        previewObjectFit === "cover" ? "object-cover" : "object-contain"
                      }`
                }
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className={removeButtonClassName}
                disabled={disabled}
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
    </div>
  );
}
