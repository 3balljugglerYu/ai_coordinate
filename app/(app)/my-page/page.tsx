import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { CachedMyPageImageGallery } from "@/features/my-page/components/CachedMyPageImageGallery";
import { CachedMyPagePercoinBalance } from "@/features/my-page/components/CachedMyPagePercoinBalance";
import { CachedMyPageProfileHeader } from "@/features/my-page/components/CachedMyPageProfileHeader";
import { CachedMyPageUserStats } from "@/features/my-page/components/CachedMyPageUserStats";
import { ProfileHeaderSkeleton } from "@/features/my-page/components/ProfileHeaderSkeleton";
import { UserStatsSkeleton } from "@/features/my-page/components/UserStatsSkeleton";
import { PercoinBalanceSkeleton } from "@/features/my-page/components/PercoinBalanceSkeleton";
import { MyPageImageGallerySkeleton } from "@/features/my-page/components/MyPageImageGallerySkeleton";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export default async function MyPagePage() {
  const [myPageT, creditsT, localeValue] = await Promise.all([
    getTranslations("myPage"),
    getTranslations("credits"),
    getLocale(),
  ]);
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <RefreshOnMount />
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<ProfileHeaderSkeleton />}>
            <CachedMyPageProfileHeader userId={user.id} />
          </Suspense>

          <Suspense fallback={<UserStatsSkeleton />}>
            <CachedMyPageUserStats userId={user.id} />
          </Suspense>

          <Suspense fallback={<PercoinBalanceSkeleton />}>
            <CachedMyPagePercoinBalance
              userId={user.id}
              locale={locale}
              copy={{
                balanceLabel: myPageT("balanceLabel"),
                balancePaid: myPageT("balancePaid"),
                balanceUnlimitedBonus: myPageT("balanceUnlimitedBonus"),
                balancePeriodLimited: myPageT("balancePeriodLimited"),
                percoinUnit: creditsT("percoinUnit"),
                buy: myPageT("buy"),
                transactionHistoryLink: myPageT("transactionHistoryLink"),
              }}
            />
          </Suspense>

          <div className="mt-8">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">
              {myPageT("generatedImagesTitle")}
            </h2>
            <Suspense fallback={<MyPageImageGallerySkeleton />}>
              <CachedMyPageImageGallery userId={user.id} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
