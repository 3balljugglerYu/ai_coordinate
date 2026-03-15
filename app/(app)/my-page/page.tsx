import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { CachedMyPageContent } from "@/features/my-page/components/CachedMyPageContent";
import { ProfileHeaderSkeleton } from "@/features/my-page/components/ProfileHeaderSkeleton";
import { UserStatsSkeleton } from "@/features/my-page/components/UserStatsSkeleton";
import { PercoinBalanceSkeleton } from "@/features/my-page/components/PercoinBalanceSkeleton";
import { MyPageImageGallerySkeleton } from "@/features/my-page/components/MyPageImageGallerySkeleton";

export default async function MyPagePage() {
  const [myPageT, creditsT] = await Promise.all([
    getTranslations("myPage"),
    getTranslations("credits"),
  ]);
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
                    {myPageT("generatedImagesTitle")}
                  </h2>
                  <MyPageImageGallerySkeleton />
                </div>
              </>
            }
          >
            <CachedMyPageContent
              userId={user.id}
              copy={{
                balanceLabel: myPageT("balanceLabel"),
                balancePaid: myPageT("balancePaid"),
                balanceUnlimitedBonus: myPageT("balanceUnlimitedBonus"),
                balancePeriodLimited: myPageT("balancePeriodLimited"),
                percoinUnit: creditsT("percoinUnit"),
                buy: myPageT("buy"),
                transactionHistoryLink: myPageT("transactionHistoryLink"),
                generatedImagesTitle: myPageT("generatedImagesTitle"),
              }}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
