"use client";

import { useState } from "react";
import { StockImageListClient } from "./StockImageListClient";
import { StockImageUploadCard } from "./StockImageUploadCard";
import type { SourceImageStock } from "../lib/database";
import { useRouter } from "next/navigation";
import {
  SELECTED_STOCK_ID_STORAGE_KEY,
  writePreferredImageSourceType,
  writePreferredSelectedStockId,
} from "../lib/form-preferences";

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
    // 選択状態を localStorage に保存して、別タブの GenerationForm と共有
    writePreferredSelectedStockId(stock?.id ?? null);
    if (stock) {
      writePreferredImageSourceType("stock");
    }
    // 同一タブ内の他コンポーネントへ通知（同一タブでは storage event は発火しないため）
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SELECTED_STOCK_ID_STORAGE_KEY,
          newValue: stock?.id ?? null,
        })
      );
    }
  };

  const handleDelete = () => {
    // 削除された画像が選択されていた場合は選択を解除
    if (selectedStock) {
      setSelectedStock(null);
      writePreferredSelectedStockId(null);
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
