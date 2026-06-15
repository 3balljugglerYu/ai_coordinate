import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GenerationFormSkeleton } from "@/features/generation/components/GenerationFormSkeleton";
import { CoordinatePageBody } from "@/features/generation/components/CoordinatePageBody";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("coordinate");

  return createMarketingPageMetadata({
    title: t("pageTitle"),
    description: t("pageDescription"),
    path: "/coordinate",
    locale,
  });
}

export default async function CoordinatePage() {
  // 静的ヘッダ(タイトル/説明)に必要なのは翻訳のみ。データ取得・認証は
  // 下の <Suspense> 配下に隔離し、ヘッダを即時描画する。
  const t = await getTranslations("coordinate");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl animate-page-enter motion-reduce:animate-none">
          {/* 静的コンテンツ: タイトルと説明文(データに依存しないので即時表示) */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pageTitle")}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {t("pageDescription")}
            </p>
          </div>

          {/* ユーザー依存の本体(認証・残高・生成フォーム・生成結果)をストリーミング */}
          <Suspense fallback={<CoordinatePageBodyFallback />}>
            <CoordinatePageBody />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/** CoordinatePageBody の読み込み中スケルトン(残高バー + 生成フォーム想定)。 */
function CoordinatePageBodyFallback() {
  return (
    <>
      <div className="mb-6 h-16 animate-pulse rounded-lg bg-gray-200" />
      <GenerationFormSkeleton />
    </>
  );
}
