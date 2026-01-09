import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import {
  getPercoinBalanceServer,
  getPercoinTransactionsServer,
} from "@/features/my-page/lib/server-api";
import { PercoinPageContent } from "@/features/my-page/components/PercoinPageContent";
import { PercoinPageSkeleton } from "@/features/my-page/components/PercoinPageSkeleton";

async function PercoinPageData() {
  const user = await requireAuth();
  const userId = user.id;

  const [percoinBalance, transactions] = await Promise.all([
    getPercoinBalanceServer(userId),
    getPercoinTransactionsServer(userId),
  ]);

  return (
    <PercoinPageContent
      percoinBalance={percoinBalance}
      transactions={transactions}
    />
  );
}

export default async function PercoinPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトル */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">ペルコイン管理</h1>
            <p className="mt-2 text-sm text-gray-600">
              残高と取引履歴を確認できます
            </p>
          </div>

          {/* 動的コンテンツ */}
          <Suspense fallback={<PercoinPageSkeleton />}>
            <PercoinPageData />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
