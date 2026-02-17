"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ROUTES } from "@/constants";
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
      {/* ペルコイン残高カード（タップで購入画面へ遷移） */}
      <Link href={ROUTES.MY_PAGE_CREDITS_PURCHASE}>
        <Card className="mb-8 p-6 transition-opacity hover:opacity-90 cursor-pointer">
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
            <div>
              <p className="text-sm text-gray-600">ペルコイン残高</p>
              <p className="text-2xl font-bold text-gray-900">
                {percoinBalance.toLocaleString()} ペルコイン
              </p>
            </div>
          </div>
        </Card>
      </Link>

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
