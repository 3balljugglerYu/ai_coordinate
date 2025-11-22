import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import {
  getCreditBalanceServer,
  getCreditTransactionsServer,
} from "@/features/my-page/lib/server-api";
import { CreditsPageContent } from "@/features/my-page/components/CreditsPageContent";
import { CreditsPageSkeleton } from "@/features/my-page/components/CreditsPageSkeleton";

async function CreditsPageData() {
  const user = await requireAuth();
  const userId = user.id;

  const [creditBalance, transactions] = await Promise.all([
    getCreditBalanceServer(userId),
    getCreditTransactionsServer(userId),
  ]);

  return (
    <CreditsPageContent
      creditBalance={creditBalance}
      transactions={transactions}
    />
  );
}

export default async function CreditsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトル */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">クレジット</h1>
            <p className="mt-2 text-sm text-gray-600">
              クレジットの購入と取引履歴を確認できます
            </p>
          </div>

          {/* 動的コンテンツ */}
          <Suspense fallback={<CreditsPageSkeleton />}>
            <CreditsPageData />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

