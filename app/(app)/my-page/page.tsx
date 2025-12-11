import { Suspense } from "react";
import { ProfileHeaderWrapper } from "@/features/my-page/components/ProfileHeaderWrapper";
import { UserStatsWrapper } from "@/features/my-page/components/UserStatsWrapper";
import { CreditBalanceWrapper } from "@/features/my-page/components/CreditBalanceWrapper";
import { MyPageImageGalleryWrapper } from "@/features/my-page/components/MyPageImageGalleryWrapper";
import { ProfileHeaderSkeleton } from "@/features/my-page/components/ProfileHeaderSkeleton";
import { UserStatsSkeleton } from "@/features/my-page/components/UserStatsSkeleton";
import { CreditBalanceSkeleton } from "@/features/my-page/components/CreditBalanceSkeleton";
import { MyPageImageGallerySkeleton } from "@/features/my-page/components/MyPageImageGallerySkeleton";

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

          {/* プロフィールヘッダー: 独立したSuspense境界 */}
          <Suspense fallback={<ProfileHeaderSkeleton />}>
            <ProfileHeaderWrapper />
          </Suspense>

          {/* 統計情報: 独立したSuspense境界（プロフィールヘッダーと並列実行） */}
          <Suspense fallback={<UserStatsSkeleton />}>
            <UserStatsWrapper />
          </Suspense>

          {/* クレジット残高: 独立したSuspense境界（統計情報と並列実行） */}
          <Suspense fallback={<CreditBalanceSkeleton />}>
            <CreditBalanceWrapper />
          </Suspense>

          {/* 画像一覧: 独立したSuspense境界（クレジット残高と並列実行） */}
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

