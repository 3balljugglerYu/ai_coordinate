import { connection } from "next/server";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { RefreshOnMount } from "@/components/RefreshOnMount";
import { CachedPercoinPageContent } from "@/features/my-page/components/CachedPercoinPageContent";
import { PercoinPageSkeleton } from "@/features/my-page/components/PercoinPageSkeleton";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("credits");

  return createMarketingPageMetadata({
    title: t("managementTitle"),
    description: t("managementDescription"),
    path: "/my-page/credits",
    locale,
  });
}

export default async function PercoinPage() {
  await connection();

  const creditsT = await getTranslations("credits");
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <RefreshOnMount />
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 静的コンテンツ: タイトル */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{creditsT("managementTitle")}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {creditsT("managementDescription")}
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
