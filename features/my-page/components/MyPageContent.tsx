"use client";

import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MyImageGallery } from "./MyImageGallery";
import {
  deleteMyImage,
  getCreditTransactions,
  type CreditTransaction,
} from "../lib/api";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { CreditPurchaseSection } from "./CreditPurchaseSection";
import { CreditTransactions } from "./CreditTransactions";

interface MyPageContentProps {
  images: GeneratedImageRecord[];
  creditBalance: number;
  transactions: CreditTransaction[];
}

export function MyPageContent({
  images,
  creditBalance: initialBalance,
  transactions: initialTransactions,
}: MyPageContentProps) {
  const [imagesState, setImages] = useState(images);
  const [creditBalance, setCreditBalance] = useState(initialBalance);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (imageId: string) => {
    try {
      await deleteMyImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

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
          <Button
            variant="outline"
            onClick={() => {
              const element = document.getElementById("credit-purchase");
              element?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            購入
          </Button>
        </div>
      </Card>

      {/* エラー表示 */}
      {error && (
        <Card className="mb-8 border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{error}</p>
        </Card>
      )}

      {/* クレジット購入セクション */}
      <div id="credit-purchase" className="mb-8">
        <CreditPurchaseSection onBalanceUpdate={handlePurchaseCompleted} />
      </div>

      {/* 取引履歴 */}
      <div className="mb-8">
        <CreditTransactions transactions={transactions} />
      </div>

      {/* 画像一覧 */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            生成画像一覧 ({imagesState.length}枚)
          </h2>
        </div>

        <MyImageGallery images={imagesState} onDelete={handleDelete} />
      </div>
    </>
  );
}

