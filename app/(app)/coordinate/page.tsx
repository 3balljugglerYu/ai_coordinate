import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { GenerationFormSkeleton } from "@/features/generation/components/GenerationFormSkeleton";
import { GeneratedImageGallerySkeleton } from "@/features/generation/components/GeneratedImageGallerySkeleton";
import { CachedCoordinatePercoinBalance } from "@/features/credits/components/CachedCoordinatePercoinBalance";
import { CachedGeneratedImageGallery } from "@/features/generation/components/CachedGeneratedImageGallery";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import type { Locale } from "@/i18n/config";

export default async function CoordinatePage() {
  const t = await getTranslations("coordinate");
  const creditsT = await getTranslations("credits");
  const locale = (await getLocale()) as Locale;
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <RefreshOnMount />
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

          {/* ペルコイン残高と購入リンク */}
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

          {/* GenerationForm と 生成結果一覧を GenerationStateProvider でラップ（スケルトン表示のため） */}
          <GenerationStateProvider>
            {/* GenerationForm */}
            <Suspense fallback={<GenerationFormSkeleton />}>
              <GenerationFormContainer />
            </Suspense>

            {/* 生成結果一覧 */}
            <div className="mt-8">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">
                {t("resultsTitle")}
              </h2>
              <Suspense fallback={<GeneratedImageGallerySkeleton />}>
                <CachedGeneratedImageGallery userId={user.id} />
              </Suspense>
            </div>
          </GenerationStateProvider>
        </div>
      </div>
    </div>
  );
}
