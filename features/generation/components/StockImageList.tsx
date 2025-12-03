"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getSourceImageStocks,
  deleteSourceImageStock,
  type SourceImageStock,
} from "../lib/database";
import Image from "next/image";

interface StockImageListProps {
  onSelect?: (stock: SourceImageStock) => void;
  onDelete?: (stockId: string) => void;
  className?: string;
}

export function StockImageList({
  onSelect,
  onDelete,
  className,
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
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {stocks.map((stock) => {
          const isDeleting = deletingIds.has(stock.id);
          return (
            <Card
              key={stock.id}
              className={`group relative overflow-hidden ${
                onSelect ? "cursor-pointer hover:ring-2 hover:ring-primary" : ""
              }`}
              onClick={() => onSelect?.(stock)}
            >
              <div className="relative aspect-square">
                <Image
                  src={stock.image_url}
                  alt={stock.name || "ストック画像"}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                />
                {isDeleting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                {!isDeleting && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(stock);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {stock.name && (
                <div className="p-2">
                  <p className="truncate text-xs text-gray-600">{stock.name}</p>
                  {stock.usage_count > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      使用回数: {stock.usage_count}
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

