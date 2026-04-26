import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { getUser } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { GenerationFormSkeleton } from "@/features/generation/components/GenerationFormSkeleton";
import { GeneratedImageGallerySkeleton } from "@/features/generation/components/GeneratedImageGallerySkeleton";
import { CachedCoordinatePercoinBalance } from "@/features/credits/components/CachedCoordinatePercoinBalance";
import { CachedGeneratedImageGallery } from "@/features/generation/components/CachedGeneratedImageGallery";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import { getUserProfileServer } from "@/features/my-page/lib/server-api";
import type { Locale } from "@/i18n/config";
import { CoordinateGuestLoginCta } from "@/features/generation/components/CoordinateGuestLoginCta";

export default async function CoordinatePage() {
  const t = await getTranslations("coordinate");
  const creditsT = await getTranslations("credits");
  const locale = (await getLocale()) as Locale;
  // Phase 6 / UCL-005: 未ログインユーザーも /coordinate を開けるようにする。
  const user = await getUser();
  const isGuest = user === null;
  const profile = isGuest ? null : await getUserProfileServer(user.id);

  return (
    <div className="min-h-screen bg-gray-50">
      {!isGuest ? <RefreshOnMount /> : null}
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトルと説明文 */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pageTitle")}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {t("pageDescription")}
            </p>
          </div>

          {isGuest ? (
            // UCL-005: 未ログイン時は上部にログイン誘導 CTA を常時表示
            <CoordinateGuestLoginCta />
          ) : (
            // ペルコイン残高と購入リンク
            <Suspense
              fallback={
                <div className="mb-6 h-16 animate-pulse rounded-lg bg-gray-200" />
              }
            >
              <CachedCoordinatePercoinBalance
                userId={user.id}
                locale={locale}
                copy={{
                  balanceLabel: creditsT("balanceLabel"),
                  percoinUnit: creditsT("percoinUnit"),
                }}
              />
            </Suspense>
          )}

          {/* GenerationForm と 生成結果一覧を GenerationStateProvider でラップ */}
          <GenerationStateProvider>
            <Suspense fallback={<GenerationFormSkeleton />}>
              <GenerationFormContainer
                subscriptionPlan={profile?.subscription_plan ?? "free"}
                authState={isGuest ? "guest" : "authenticated"}
              />
            </Suspense>

            {/* 生成結果一覧 (認証ユーザーのみ。ゲストは GuestResultPreview を見る) */}
            {!isGuest ? (
              <div className="mt-8">
                <h2 className="mb-4 text-xl font-semibold text-gray-900">
                  {t("resultsTitle")}
                </h2>
                <Suspense fallback={<GeneratedImageGallerySkeleton />}>
                  <CachedGeneratedImageGallery userId={user.id} />
                </Suspense>
              </div>
            ) : null}
          </GenerationStateProvider>
        </div>
      </div>
    </div>
  );
}
