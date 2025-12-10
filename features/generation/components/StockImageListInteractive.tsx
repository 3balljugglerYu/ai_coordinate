"use client";

import { useState } from "react";
import { StockImageListClient } from "./StockImageListClient";
import { StockImageUploadCard } from "./StockImageUploadCard";
import type { SourceImageStock } from "../lib/database";
import { useRouter } from "next/navigation";

interface StockImageListInteractiveProps {
  stocks: SourceImageStock[];
  stockLimit: number;
  currentCount: number;
}

/**
 * クライアントコンポーネント: ストック画像リスト（選択機能付き）
 */
export function StockImageListInteractive({
  stocks: initialStocks,
  stockLimit,
  currentCount,
}: StockImageListInteractiveProps) {
  const [selectedStock, setSelectedStock] = useState<SourceImageStock | null>(null);
  const router = useRouter();

  const handleSelect = (stock: SourceImageStock | null) => {
    setSelectedStock(stock);
    // 選択状態をlocalStorageに保存して、GenerationFormと共有
    if (stock) {
      localStorage.setItem("selectedStockId", stock.id);
      // カスタムイベントを発火してGenerationFormに通知
      window.dispatchEvent(new Event("storage"));
    } else {
      localStorage.removeItem("selectedStockId");
      // カスタムイベントを発火してGenerationFormに通知
      window.dispatchEvent(new Event("storage"));
    }
  };

  const handleDelete = () => {
    // 削除された画像が選択されていた場合は選択を解除
    if (selectedStock) {
      setSelectedStock(null);
      localStorage.removeItem("selectedStockId");
    }
  };

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <StockImageListClient
      stocks={initialStocks}
      selectedStockId={selectedStock?.id || null}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onRefreshTrigger={handleRefresh}
      renderUploadCard={() => (
        <StockImageUploadCard
          stockLimit={stockLimit}
          currentCount={currentCount}
          onUploadSuccess={handleRefresh}
          onUploadError={(error) => {
            console.error("Stock upload error:", error);
            alert(error);
          }}
        />
      )}
    />
  );
}
