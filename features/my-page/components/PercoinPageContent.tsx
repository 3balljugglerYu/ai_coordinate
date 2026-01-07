"use client";

import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PercoinPurchaseSection } from "./PercoinPurchaseSection";
import { PercoinTransactions } from "./PercoinTransactions";
import {
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

  const refreshTransactions = async () => {
    try {
      const percoinTransactions = await getPercoinTransactions();
      setTransactions(percoinTransactions);
    } catch (err) {
      console.error("Failed to refresh percoin info:", err);
    }
  };

  const handlePurchaseCompleted = async (balance: number) => {
    setPercoinBalance(balance);
    await refreshTransactions();
  };

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
        </div>
      </Card>

      {/* ペルコイン購入セクション */}
      <div id="percoin-purchase" className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          ペルコイン購入
        </h2>
        <PercoinPurchaseSection onBalanceUpdate={handlePurchaseCompleted} />
      </div>

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
