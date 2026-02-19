import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { CachedPercoinPageContent } from "@/features/my-page/components/CachedPercoinPageContent";
import { PercoinPageSkeleton } from "@/features/my-page/components/PercoinPageSkeleton";

export default async function PercoinPage() {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <RefreshOnMount />
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
            <CachedPercoinPageContent userId={user.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
