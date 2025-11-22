import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  getMyImagesServer,
  getCreditBalanceServer,
  getCreditTransactionsServer,
} from "@/features/my-page/lib/server-api";
import { MyPageContent } from "@/features/my-page/components/MyPageContent";
import { MyPageSkeleton } from "@/features/my-page/components/MyPageSkeleton";

async function MyPageData() {
  const user = await requireAuth();
  const userId = user.id;

  const [images, creditBalance, transactions] = await Promise.all([
    getMyImagesServer(userId),
    getCreditBalanceServer(userId),
    getCreditTransactionsServer(userId),
  ]);

  return (
    <MyPageContent
      images={images}
      creditBalance={creditBalance}
      transactions={transactions}
    />
  );
}

export default async function MyPagePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトルと説明文 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">マイページ</h1>
            <p className="mt-2 text-sm text-gray-600">
              あなたが生成した画像の一覧
            </p>
          </div>

          {/* 動的コンテンツ */}
          <Suspense fallback={<MyPageSkeleton />}>
            <MyPageData />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

