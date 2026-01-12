import { Suspense } from "react";
import { ProfileHeaderWrapper } from "@/features/my-page/components/ProfileHeaderWrapper";
import { UserStatsWrapper } from "@/features/my-page/components/UserStatsWrapper";
import { PercoinBalanceWrapper } from "@/features/my-page/components/PercoinBalanceWrapper";
import { MyPageImageGalleryWrapper } from "@/features/my-page/components/MyPageImageGalleryWrapper";
import { ProfileHeaderSkeleton } from "@/features/my-page/components/ProfileHeaderSkeleton";
import { UserStatsSkeleton } from "@/features/my-page/components/UserStatsSkeleton";
import { PercoinBalanceSkeleton } from "@/features/my-page/components/PercoinBalanceSkeleton";
import { MyPageImageGallerySkeleton } from "@/features/my-page/components/MyPageImageGallerySkeleton";
import { StreakChecker } from "@/components/StreakChecker";

export default async function MyPagePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <StreakChecker />
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* プロフィールヘッダー: 独立したSuspense境界 */}
          <Suspense fallback={<ProfileHeaderSkeleton />}>
            <ProfileHeaderWrapper />
          </Suspense>

          {/* 統計情報: 独立したSuspense境界（プロフィールヘッダーと並列実行） */}
          <Suspense fallback={<UserStatsSkeleton />}>
            <UserStatsWrapper />
          </Suspense>

          {/* ペルコイン残高: 独立したSuspense境界（統計情報と並列実行） */}
          <Suspense fallback={<PercoinBalanceSkeleton />}>
            <PercoinBalanceWrapper />
          </Suspense>

          {/* 画像一覧: 独立したSuspense境界（ペルコイン残高と並列実行） */}
          <div className="mt-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              生成画像一覧
            </h2>
            <Suspense fallback={<MyPageImageGallerySkeleton />}>
              <MyPageImageGalleryWrapper />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
