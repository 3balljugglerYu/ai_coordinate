"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_IMAGE_CONFIG,
  validateImageFile,
} from "../lib/validation";
import { normalizeSourceImage } from "../lib/normalize-source-image";
import type { ImageUploadConfig } from "../types";

interface StockImageAddButtonProps {
  disabled?: boolean;
  onUploadSuccess?: (stockId: string) => void;
  onUploadError?: (error: string) => void;
  config?: ImageUploadConfig;
}

export function StockImageAddButton({
  disabled = false,
  onUploadSuccess,
  onUploadError,
  config = DEFAULT_IMAGE_CONFIG,
}: StockImageAddButtonProps) {
  const t = useTranslations("coordinate");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isDisabled = disabled || isUploading;

  const uploadFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const result = await validateImageFile(file, config, {
          imageLoadFailed: t("imageLoadFailed"),
          invalidFileFormat: (formats) => t("invalidFileFormat", { formats }),
          fileTooLarge: (maxSizeMB, currentSizeMB) =>
            t("fileTooLarge", { maxSizeMB, currentSizeMB }),
          imageValidationFailed: t("imageValidationFailed"),
        });

        if (!result.isValid) {
          throw new Error(result.error || t("stockUploadFailed"));
        }

        if (result.previewUrl) {
          URL.revokeObjectURL(result.previewUrl);
        }

        const normalizedFile = await normalizeSourceImage(file, {
          imageLoadFailed: t("imageLoadFailed"),
          imageConvertFailed: t("imageConvertFailed"),
          imageContextUnavailable: t("imageContextUnavailable"),
        });
        const formData = new FormData();
        formData.append("file", normalizedFile);

        const res = await fetch("/api/source-image-stocks", {
          method: "POST",
          body: formData,
        });

        const contentType = res.headers.get("content-type");
        if (contentType?.includes("text/html")) {
          throw new Error(t("loginRequired"));
        }

        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };

        if (!res.ok || !data.id) {
          throw new Error(data.error || t("stockUploadFailed"));
        }

        onUploadSuccess?.(data.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("stockUploadFailed");
        onUploadError?.(message);
      } finally {
        setIsUploading(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [config, onUploadError, onUploadSuccess, t]
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("addStockImageAction")}
        title={t("addStockImageAction")}
        onClick={() => inputRef.current?.click()}
        disabled={isDisabled}
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={config.allowedFormats.join(",")}
        onChange={handleInputChange}
        className="hidden"
        disabled={isDisabled}
      />
    </>
  );
}
