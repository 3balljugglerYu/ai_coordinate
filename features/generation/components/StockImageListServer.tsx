import { getUser } from "@/lib/auth";
import { getSourceImageStocksServer } from "../lib/server-database";
import { StockImageListClient } from "./StockImageListClient";
import type { SourceImageStock } from "../lib/database";

interface StockImageListServerProps {
  onSelect?: (stock: SourceImageStock | null) => void;
  onDelete?: (stockId: string) => void;
  selectedStockId?: string | null;
  className?: string;
  renderUploadCard?: () => React.ReactNode;
}

export async function StockImageListServer({
  onSelect,
  onDelete,
  selectedStockId,
  className,
  renderUploadCard,
}: StockImageListServerProps) {
  const user = await getUser();
  
  if (!user) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <p className="text-sm">ログインが必要です</p>
      </div>
    );
  }

  const stocks = await getSourceImageStocksServer(user.id, 50, 0);

  return (
    <StockImageListClient
      stocks={stocks}
      onSelect={onSelect}
      onDelete={onDelete}
      selectedStockId={selectedStockId}
      className={className}
      renderUploadCard={renderUploadCard}
    />
  );
}

