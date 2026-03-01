"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { PercoinTransactions } from "./PercoinTransactions";
import { PeriodLimitedBreakdown } from "./PeriodLimitedBreakdown";
import {
  getPercoinBalanceBreakdown,
  getPercoinTransactions,
  getPercoinTransactionsCount,
  getFreePercoinBatchesExpiring,
  PERCOIN_TRANSACTIONS_PER_PAGE,
  type PercoinBalanceBreakdown,
  type PercoinTransaction,
  type FreePercoinBatchExpiring,
} from "../lib/api";

interface PercoinPageContentProps {
  balanceBreakdown: PercoinBalanceBreakdown;
  transactions: PercoinTransaction[];
  expiringBatches: FreePercoinBatchExpiring[];
}

export function PercoinPageContent({
  balanceBreakdown: initialBreakdown,
  transactions: initialTransactions,
  expiringBatches: initialExpiringBatches,
}: PercoinPageContentProps) {
  const [balanceBreakdown, setBalanceBreakdown] = useState(initialBreakdown);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [expiringBatches, setExpiringBatches] = useState(initialExpiringBatches);
  const [periodLimitedExpanded, setPeriodLimitedExpanded] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | "regular" | "period_limited" | "usage">("all");
  const [txOffset, setTxOffset] = useState(0);
  const [txTotalCount, setTxTotalCount] = useState<number | null>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const [breakdown, percoinTransactions, batches, count] = await Promise.all([
        getPercoinBalanceBreakdown(),
        getPercoinTransactions(
          PERCOIN_TRANSACTIONS_PER_PAGE,
          txFilter,
          0
        ),
        getFreePercoinBatchesExpiring(),
        getPercoinTransactionsCount(txFilter),
      ]);
      setBalanceBreakdown(breakdown);
      setTransactions(percoinTransactions);
      setExpiringBatches(batches);
      setTxTotalCount(count);
      setTxOffset(0);
    } catch (err) {
      console.error("Failed to refresh percoin info:", err);
    }
  }, [txFilter]);

  const refreshTransactions = useCallback(
    async (offset = 0) => {
      try {
        setIsLoadingTransactions(true);
        const [percoinTransactions, count] = await Promise.all([
          getPercoinTransactions(
            PERCOIN_TRANSACTIONS_PER_PAGE,
            txFilter,
            offset
          ),
          txTotalCount === null
            ? getPercoinTransactionsCount(txFilter)
            : Promise.resolve(txTotalCount),
        ]);
        setTransactions(percoinTransactions);
        setTxOffset(offset);
        if (txTotalCount === null) setTxTotalCount(count);
      } catch (err) {
        console.error("Failed to refresh percoin info:", err);
      } finally {
        setIsLoadingTransactions(false);
      }
    },
    [txFilter, txTotalCount]
  );

  const handleFilterChange = useCallback((filter: "all" | "regular" | "period_limited" | "usage") => {
    setTxFilter(filter);
    setTxOffset(0);
    setTxTotalCount(null);
  }, []);

  const handleNextPage = useCallback(() => {
    const newOffset = txOffset + PERCOIN_TRANSACTIONS_PER_PAGE;
    refreshTransactions(newOffset);
  }, [txOffset, refreshTransactions]);

  const handlePageClick = useCallback(
    (page: number) => {
      const newOffset = (page - 1) * PERCOIN_TRANSACTIONS_PER_PAGE;
      refreshTransactions(newOffset);
    },
    [refreshTransactions]
  );

  // ページ遷移時・マウント時にデータを再フェッチ（/my-page/creditsに遷移した際に最新データを取得）
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // フィルタ変更時のみ取引履歴を再取得（初回マウントは refreshAll で対応）
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    refreshTransactions(0);
  }, [txFilter, refreshTransactions]);

  // 画像生成完了時に取引履歴を更新
  useEffect(() => {
    const handleGenerationComplete = () => {
      // 画像生成が完了したら、少し遅延してから取引履歴を更新
      // Edge Functionで取引履歴が保存されるまで少し時間がかかるため
      setTimeout(() => {
        refreshAll();
      }, 2000); // 2秒後に更新
    };

    // カスタムイベントをリッスン
    window.addEventListener('generation-complete', handleGenerationComplete);

    return () => {
      window.removeEventListener('generation-complete', handleGenerationComplete);
    };
  }, [refreshAll]);

  // 将来的に別ページ（/my-page/credits/purchase）に分離予定のためコメントアウト
  // 購入完了時のバランス更新ロジック（将来の復活用に保持）
  // const handlePurchaseCompleted = async (balance: number) => {
  //   setPercoinBalance(balance);
  //   await refreshTransactions();
  // };

  return (
    <>
      {/* 保有ペルコインカード */}
      <div className="mb-8">
        <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                <Image
                  src="/percoin.png"
                  alt="ペルコイン"
                  width={48}
                  height={48}
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600">保有ペルコイン</p>
                <p className="text-2xl font-bold text-gray-900">
                  {balanceBreakdown.total.toLocaleString()} ペルコイン
                </p>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>うち無期限</span>
                    <span>{balanceBreakdown.regular.toLocaleString()}</span>
                  </div>
                  <PeriodLimitedBreakdown
                    batches={expiringBatches}
                    periodLimitedTotal={balanceBreakdown.period_limited}
                    onToggle={setPeriodLimitedExpanded}
                    isExpanded={periodLimitedExpanded}
                    variant="row"
                  />
                </div>
              </div>
            </div>
          </Card>
        {/* 展開表示 */}
        {periodLimitedExpanded && balanceBreakdown.period_limited > 0 && (
          <PeriodLimitedBreakdown
            batches={expiringBatches}
            periodLimitedTotal={balanceBreakdown.period_limited}
            onToggle={setPeriodLimitedExpanded}
            isExpanded={periodLimitedExpanded}
            variant="expanded"
          />
        )}
      </div>

      {/* ペルコイン購入セクション */}
      {/* 将来的に別ページ（/my-page/credits/purchase）に分離予定のためコメントアウト */}
      {/* <div id="percoin-purchase" className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          ペルコイン購入
        </h2>
        <PercoinPurchaseSection onBalanceUpdate={handlePurchaseCompleted} />
      </div> */}

      {/* 取引履歴 */}
      <div className="mb-8">
        <PercoinTransactions
          transactions={transactions}
          filter={txFilter}
          offset={txOffset}
          totalCount={txTotalCount}
          isLoading={isLoadingTransactions}
          onFilterChange={handleFilterChange}
          onPageClick={handlePageClick}
          onNextPage={handleNextPage}
        />
      </div>
    </>
  );
}
