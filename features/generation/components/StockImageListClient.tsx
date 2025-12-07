"use client";

import { useState, useEffect } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteSourceImageStock, type SourceImageStock } from "../lib/database";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface StockImageListClientProps {
  stocks: SourceImageStock[];
  onSelect?: (stock: SourceImageStock | null) => void;
  onDelete?: (stockId: string) => void;
  selectedStockId?: string | null;
  className?: string;
  renderUploadCard?: () => React.ReactNode;
  onRefreshTrigger?: () => void;
}

export function StockImageListClient({
  stocks: initialStocks,
  onSelect,
  onDelete,
  selectedStockId,
  className,
  renderUploadCard,
  onRefreshTrigger,
}: StockImageListClientProps) {
  const [stocks, setStocks] = useState<SourceImageStock[]>(initialStocks);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  // initialStocksが変更されたらstocks状態を更新
  useEffect(() => {
    setStocks(initialStocks);
  }, [initialStocks]);

  const handleDelete = async (stock: SourceImageStock) => {
    if (!confirm("このストック画像を削除しますか？")) {
      return;
    }

    setDeletingIds((prev) => new Set(prev).add(stock.id));
    try {
      await deleteSourceImageStock(stock.id);
      // 楽観的更新: クライアントサイドで即座に状態を更新
      setStocks((prev) => prev.filter((s) => s.id !== stock.id));
      onDelete?.(stock.id);
      // リフレッシュトリガーを呼び出してStockImageUploadCardの制限数を更新
      onRefreshTrigger?.();
      // サーバーコンポーネントを再レンダリングしてデータを同期
      router.refresh();
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

  return (
    <div className={className}>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {renderUploadCard && (
          <div className="flex-shrink-0 w-[140px] sm:w-[160px]">
            {renderUploadCard()}
          </div>
        )}
        {stocks.map((stock) => {
          const isDeleting = deletingIds.has(stock.id);
          const isSelected = selectedStockId === stock.id;
          return (
            <Card
              key={stock.id}
              className={`group relative overflow-hidden flex-shrink-0 w-[140px] sm:w-[160px] p-0 ${
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
              <div className="relative w-full overflow-hidden bg-gray-100">
                <Image
                  src={stock.image_url}
                  alt={stock.name || "ストック画像"}
                  width={800}
                  height={800}
                  className="w-full h-auto object-contain"
                  sizes="140px"
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

