import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import {
  getUserProfileServer,
  getUserStatsServer,
  getMyImagesServer,
  getCreditBalanceServer,
} from "@/features/my-page/lib/server-api";
import { MyPageContent } from "@/features/my-page/components/MyPageContent";
import { MyPageSkeleton } from "@/features/my-page/components/MyPageSkeleton";

async function MyPageData() {
  const user = await requireAuth();
  const userId = user.id;

  const [profile, stats, images, creditBalance] = await Promise.all([
    getUserProfileServer(userId),
    getUserStatsServer(userId),
    getMyImagesServer(userId, "all"),
    getCreditBalanceServer(userId),
  ]);

  return (
    <MyPageContent
      profile={profile}
      stats={stats}
      images={images}
      creditBalance={creditBalance}
      currentUserId={userId}
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
            <h1 className="text-3xl font-bold text-gray-900">
              マイページ
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              プロフィールや生成画像を管理できます
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

