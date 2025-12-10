import { getUser } from "@/lib/auth";
import { getSourceImageStocksServer, getStockImageLimitServer } from "../lib/server-database";
import { StockImageListClient } from "./StockImageListClient";
import { StockImageUploadCard } from "./StockImageUploadCard";
import { StockImageListInteractive } from "./StockImageListInteractive";

/**
 * サーバーコンポーネント: ストック画像リストと制限数を取得
 */
export async function StockImageListWrapper() {
  const user = await getUser();
  
  if (!user) {
    return null;
  }

  try {
    // ストック画像リストと制限数を並列取得
    const [stocks, limitInfo] = await Promise.all([
      getSourceImageStocksServer(user.id, 50, 0),
      getStockImageLimitServer(user.id),
    ]);

    return (
      <StockImageListInteractive
        stocks={stocks}
        stockLimit={limitInfo.limit}
        currentCount={limitInfo.currentCount}
      />
    );
  } catch (error) {
    console.error("[StockImageListWrapper] エラー:", error);
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-900">
          ストック画像の取得に失敗しました
        </p>
      </div>
    );
  }
}
