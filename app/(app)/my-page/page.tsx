import { Suspense } from "react";
import { requireAuth } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { CachedMyPageContent } from "@/features/my-page/components/CachedMyPageContent";
import { ProfileHeaderSkeleton } from "@/features/my-page/components/ProfileHeaderSkeleton";
import { UserStatsSkeleton } from "@/features/my-page/components/UserStatsSkeleton";
import { PercoinBalanceSkeleton } from "@/features/my-page/components/PercoinBalanceSkeleton";
import { MyPageImageGallerySkeleton } from "@/features/my-page/components/MyPageImageGallerySkeleton";

export default async function MyPagePage() {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <RefreshOnMount />
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          <Suspense
            fallback={
              <>
                <ProfileHeaderSkeleton />
                <UserStatsSkeleton />
                <PercoinBalanceSkeleton />
                <div className="mt-8">
                  <h2 className="mb-4 text-xl font-semibold text-gray-900">
                    生成画像一覧
                  </h2>
                  <MyPageImageGallerySkeleton />
                </div>
              </>
            }
          >
            <CachedMyPageContent userId={user.id} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
