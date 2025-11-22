"use client";

import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreditPurchaseSection } from "./CreditPurchaseSection";
import { CreditTransactions } from "./CreditTransactions";
import {
  getCreditTransactions,
  type CreditTransaction,
} from "../lib/api";

interface CreditsPageContentProps {
  creditBalance: number;
  transactions: CreditTransaction[];
}

export function CreditsPageContent({
  creditBalance: initialBalance,
  transactions: initialTransactions,
}: CreditsPageContentProps) {
  const [creditBalance, setCreditBalance] = useState(initialBalance);
  const [transactions, setTransactions] = useState(initialTransactions);

  const refreshTransactions = async () => {
    try {
      const creditTransactions = await getCreditTransactions();
      setTransactions(creditTransactions);
    } catch (err) {
      console.error("Failed to refresh credit info:", err);
    }
  };

  const handlePurchaseCompleted = async (balance: number) => {
    setCreditBalance(balance);
    await refreshTransactions();
  };

  return (
    <>
      {/* クレジット残高カード */}
      <Card className="mb-8 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <CreditCard className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">クレジット残高</p>
              <p className="text-2xl font-bold text-gray-900">
                {creditBalance.toLocaleString()} クレジット
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* クレジット購入セクション */}
      <div id="credit-purchase" className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          クレジット購入
        </h2>
        <CreditPurchaseSection onBalanceUpdate={handlePurchaseCompleted} />
      </div>

      {/* 取引履歴 */}
      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          取引履歴
        </h2>
        <CreditTransactions transactions={transactions} />
      </div>
    </>
  );
}

