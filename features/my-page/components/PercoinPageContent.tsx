"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PercoinTransactions } from "./PercoinTransactions";
import {
  getPercoinBalance,
  getPercoinTransactions,
  type PercoinTransaction,
} from "../lib/api";

interface PercoinPageContentProps {
  percoinBalance: number;
  transactions: PercoinTransaction[];
}

export function PercoinPageContent({
  percoinBalance: initialBalance,
  transactions: initialTransactions,
}: PercoinPageContentProps) {
  const [percoinBalance, setPercoinBalance] = useState(initialBalance);
  const [transactions, setTransactions] = useState(initialTransactions);

  const refreshAll = useCallback(async () => {
    try {
      const [balance, percoinTransactions] = await Promise.all([
        getPercoinBalance(),
        getPercoinTransactions(),
      ]);
      setPercoinBalance(balance);
      setTransactions(percoinTransactions);
    } catch (err) {
      console.error("Failed to refresh percoin info:", err);
    }
  }, []);

  const refreshTransactions = async () => {
    try {
      const percoinTransactions = await getPercoinTransactions();
      setTransactions(percoinTransactions);
    } catch (err) {
      console.error("Failed to refresh percoin info:", err);
    }
  };

  // ページ遷移時・マウント時にデータを再フェッチ（/my-page/creditsに遷移した際に最新データを取得）
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

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
      {/* ペルコイン残高カード */}
      <Card className="mb-8 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <CreditCard className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">ペルコイン残高</p>
              <p className="text-2xl font-bold text-gray-900">
                {percoinBalance.toLocaleString()} ペルコイン
              </p>
            </div>
          </div>
          <Link href="/my-page/credits/purchase">
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              購入
            </Button>
          </Link>
        </div>
      </Card>

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
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          取引履歴
        </h2>
        <PercoinTransactions transactions={transactions} />
      </div>
    </>
  );
}
