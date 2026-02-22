"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import { StockImageListSkeleton } from "./StockImageListSkeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getSourceImageStocks,
  deleteSourceImageStock,
  type SourceImageStock,
} from "../lib/database";
import Image from "next/image";

interface StockImageListProps {
  onSelect?: (stock: SourceImageStock | null) => void;
  onDelete?: (stockId: string) => void;
  selectedStockId?: string | null;
  className?: string;
  renderUploadCard?: () => React.ReactNode;
}

export function StockImageList({
  onSelect,
  onDelete,
  selectedStockId,
  className,
  renderUploadCard,
}: StockImageListProps) {
  const [stocks, setStocks] = useState<SourceImageStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const loadStocks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSourceImageStocks(50, 0);
      setStocks(data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "ストック画像の取得に失敗しました";
      setError(errorMessage);
      console.error("Failed to load stock images:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStocks();
  }, []);

  const handleDelete = async (stock: SourceImageStock) => {
    if (!confirm("このストック画像を削除しますか？")) {
      return;
    }

    setDeletingIds((prev) => new Set(prev).add(stock.id));
    try {
      await deleteSourceImageStock(stock.id);
      setStocks((prev) => prev.filter((s) => s.id !== stock.id));
      onDelete?.(stock.id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "ストック画像の削除に失敗しました";
      alert(errorMessage);
      console.error("Failed to delete stock image:", err);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(stock.id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className={className}>
        <StockImageListSkeleton showLabel={false} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
        <p className="text-sm text-red-900">{error}</p>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <ImageIcon className="mb-4 h-12 w-12 text-gray-300" />
        <p className="text-sm">ストック画像がありません</p>
        <p className="mt-1 text-xs">画像をアップロードしてストックに保存できます</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {renderUploadCard && (
          <div className="flex-shrink-0 min-w-[200px]">
            {renderUploadCard()}
          </div>
        )}
        {stocks.map((stock) => {
          const isDeleting = deletingIds.has(stock.id);
          const isSelected = selectedStockId === stock.id;
          return (
            <Card
              key={stock.id}
              className={`group relative overflow-hidden flex-shrink-0 inline-flex w-auto max-w-[200px] p-0 ${
                onSelect ? "cursor-pointer hover:ring-2 hover:ring-primary" : ""
              } ${isSelected ? "border-2 border-primary" : ""}`}
              onClick={() => {
                if (isSelected) {
                  // 同じ画像を再クリックした場合は選択解除
                  onSelect?.(null);
                } else {
                  // 別の画像を選択
                  onSelect?.(stock);
                }
              }}
            >
              <div className="relative flex items-center justify-center overflow-hidden bg-gray-100 max-w-[200px] max-h-[200px]">
                <Image
                  src={stock.image_url}
                  alt={stock.name || "ストック画像"}
                  width={800}
                  height={800}
                  className="h-auto max-h-[200px] w-auto max-w-[200px] object-contain"
                  sizes="200px"
                />
                {isDeleting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                {!isDeleting && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 bg-gray-400/80 hover:bg-gray-500/80 text-white opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(stock);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {stock.usage_count > 0 && (
                  <div className="absolute bottom-2 right-2 text-gray-600 text-xs">
                    {stock.usage_count}回使用
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
