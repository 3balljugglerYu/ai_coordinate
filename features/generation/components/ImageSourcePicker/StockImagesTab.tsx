"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PickerImageTile } from "./PickerImageTile";
import { PickerSkeleton } from "./PickerSkeleton";
import {
  deleteSourceImageStock,
  getCurrentStockImageCount,
  getSourceImageStocks,
  getStockImageLimit,
  type SourceImageStock,
} from "../../lib/database";
import {
  DEFAULT_IMAGE_CONFIG,
  validateImageFile,
} from "../../lib/validation";
import { normalizeSourceImage } from "../../lib/normalize-source-image";

interface StockImagesTabProps {
  active: boolean;
  onSelect: (stock: SourceImageStock) => Promise<void> | void;
  /** 削除前確認や 削除後のクライアント側通知に使う (任意)。 */
  onDeleted?: (stockId: string) => void;
  /** 追加後、親に通知 (例: 未読ドット既読化やトースト表示)。 */
  onAdded?: (stock: SourceImageStock) => void;
  disabled?: boolean;
  /** 現在の選択中ストック ID (該当タイルにリング表示)。 */
  selectedStockId?: string | null;
  /** 親が fetch 中のストック ID を渡すと該当タイルにスピナーを出す。 */
  pendingStockId?: string | null;
}

export function StockImagesTab({
  active,
  onSelect,
  onDeleted,
  onAdded,
  disabled = false,
  selectedStockId = null,
  pendingStockId = null,
}: StockImagesTabProps) {
  const t = useTranslations("imageSourcePicker");
  const tCoordinate = useTranslations("coordinate");
  const [stocks, setStocks] = useState<SourceImageStock[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [stocksData, limitValue, countValue] = await Promise.all([
        getSourceImageStocks(50, 0),
        getStockImageLimit().catch(() => null),
        getCurrentStockImageCount().catch(() => null),
      ]);
      setStocks(stocksData);
      setLimit(limitValue);
      setCount(countValue);
    } catch (err) {
      console.error("[StockImagesTab] refresh failed", err);
      setError(t("loadError"));
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [t]);

  useEffect(() => {
    if (!active || hasLoadedOnce) return;
    void refresh();
  }, [active, hasLoadedOnce, refresh]);

  const isLimitReached =
    typeof limit === "number" && typeof count === "number" && count >= limit;

  const handleDelete = useCallback(
    async (stock: SourceImageStock) => {
      const confirmed = window.confirm(t("stockDeleteConfirm"));
      if (!confirmed) return;
      setPendingId(stock.id);
      try {
        await deleteSourceImageStock(stock.id);
        setStocks((prev) => prev.filter((s) => s.id !== stock.id));
        setCount((prev) => (typeof prev === "number" ? prev - 1 : prev));
        onDeleted?.(stock.id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("loadError");
        window.alert(message);
        console.error("[StockImagesTab] delete failed", err);
      } finally {
        setPendingId(null);
      }
    },
    [onDeleted, t],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const result = await validateImageFile(file, DEFAULT_IMAGE_CONFIG, {
          imageLoadFailed: tCoordinate("imageLoadFailed"),
          invalidFileFormat: (formats) =>
            tCoordinate("invalidFileFormat", { formats }),
          fileTooLarge: (maxSizeMB, currentSizeMB) =>
            tCoordinate("fileTooLarge", { maxSizeMB, currentSizeMB }),
          imageValidationFailed: tCoordinate("imageValidationFailed"),
        });
        if (!result.isValid) {
          throw new Error(result.error || tCoordinate("stockUploadFailed"));
        }
        if (result.previewUrl) {
          URL.revokeObjectURL(result.previewUrl);
        }

        const normalized = await normalizeSourceImage(file, {
          imageLoadFailed: tCoordinate("imageLoadFailed"),
          imageConvertFailed: tCoordinate("imageConvertFailed"),
          imageContextUnavailable: tCoordinate("imageContextUnavailable"),
        });
        const formData = new FormData();
        formData.append("file", normalized);

        const res = await fetch("/api/source-image-stocks", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };
        if (!res.ok || !data.id) {
          throw new Error(data.error || tCoordinate("stockUploadFailed"));
        }

        // refresh and pick the new stock.
        await refresh();
        const created = (await getSourceImageStocks(50, 0)).find(
          (s) => s.id === data.id,
        );
        if (created) {
          onAdded?.(created);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : tCoordinate("stockUploadFailed");
        window.alert(message);
        console.error("[StockImagesTab] upload failed", err);
      } finally {
        setIsUploading(false);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
      }
    },
    [onAdded, refresh, tCoordinate],
  );

  if (!hasLoadedOnce && isLoading) {
    return <PickerSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-gray-700">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  const countLabel =
    typeof count === "number" && typeof limit === "number"
      ? isLimitReached
        ? t("stockCountStatusLimitReached", {
            current: count,
            limit,
          })
        : t("stockCountStatus", { current: count, limit })
      : null;

  return (
    <div className="space-y-3">
      {countLabel ? (
        <p className="text-xs text-gray-500">{countLabel}</p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || isUploading || isLimitReached}
          aria-label={t("stockAddTileAria")}
          className={cn(
            "flex aspect-square w-full flex-col items-center justify-center rounded-md",
            "border-2 border-dashed border-gray-300 bg-white text-gray-500",
            "transition hover:border-gray-400 hover:text-gray-700",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black",
            (disabled || isUploading || isLimitReached) &&
              "cursor-not-allowed opacity-60",
          )}
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
          <span className="mt-1 text-xs font-medium">
            {t("stockAddTileLabel")}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={DEFAULT_IMAGE_CONFIG.allowedFormats.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void uploadFile(file);
            }
          }}
          className="hidden"
        />

        {stocks.map((stock) => (
          <PickerImageTile
            key={stock.id}
            imageUrl={stock.image_url}
            alt={stock.name ?? "stock image"}
            selected={selectedStockId === stock.id}
            loading={pendingId === stock.id || pendingStockId === stock.id}
            disabled={disabled}
            onSelect={() => void onSelect(stock)}
            onDelete={() => void handleDelete(stock)}
          />
        ))}
      </div>

      {stocks.length === 0 ? (
        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <p className="text-sm font-medium text-gray-700">
            {t("emptyStockTitle")}
          </p>
          <p className="text-xs text-gray-500">
            {t("emptyStockDescription")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
