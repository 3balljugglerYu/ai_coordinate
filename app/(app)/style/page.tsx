import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { StyleTourButton } from "@/features/style/components/StyleTourButton";
import { StylePageBody } from "@/features/style/components/StylePageBody";
import { StyleTotalGenerationCount } from "@/features/style/components/StyleTotalGenerationCount";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { getPublishedStylePreset } from "@/features/style-presets/lib/get-public-style-presets";

interface StylePageProps {
  searchParams?: Promise<{
    style?: string;
  }>;
}

export async function generateMetadata({
  searchParams,
}: StylePageProps): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("style");
  const metadata = createMarketingPageMetadata({
    title: t("pageTitle"),
    description: t("pageDescription"),
    path: "/style",
    locale,
  });

  // ?style=<id> が付いている共有URLでは、そのStyleのサムネイルを OGP 画像にする。
  // getPublishedStylePreset は published かつ非admin_only のみ返すため、下書き/管理限定
  // Style は自動的に既定OGへフォールバックする(非公開の漏れなし)。
  const styleId = (await searchParams)?.style;
  const preset = styleId ? await getPublishedStylePreset(styleId) : null;

  if (preset) {
    const alt = `${preset.title} | Persta.AI`;
    return {
      ...metadata,
      title: preset.title,
      openGraph: {
        ...metadata.openGraph,
        title: alt,
        images: [
          {
            url: preset.thumbnailImageUrl,
            width: preset.thumbnailWidth,
            height: preset.thumbnailHeight,
            alt,
          },
        ],
      },
      twitter: {
        ...metadata.twitter,
        title: alt,
        images: [preset.thumbnailImageUrl],
      },
    };
  }

  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      images: [
        {
          url: "/og/one-tap-style.png",
          width: 1200,
          height: 630,
          alt: `${t("pageTitle")} | Persta.AI`,
        },
      ],
    },
    twitter: {
      ...metadata.twitter,
      images: ["/og/one-tap-style.png"],
    },
  };
}

export default async function StylePage({ searchParams }: StylePageProps) {
  // 静的ヘッダ(タイトル/説明)に必要なのは翻訳のみ。データ取得・認証は
  // 下の <Suspense> 配下に隔離し、ヘッダを即時描画する。
  const t = await getTranslations("style");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-8 pt-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-6xl space-y-8 animate-page-enter motion-reduce:animate-none">
          {/* 累計生成枚数(動的): 高さ確保のスケルトンでレイアウトシフトを防ぐ */}
          <Suspense
            fallback={<div className="h-[52px] animate-pulse rounded-xl bg-gray-200" />}
          >
            <StyleTotalGenerationCount />
          </Suspense>

          {/* 静的ヘッダ: データに依存しないので即時表示される */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pageTitle")}
            </h1>
            {/* モバイルでタイトルを圧縮しないよう、チュートリアルボタンはタイトル下に左詰めで置く */}
            <StyleTourButton />
            <p className="text-sm font-medium text-gray-700">
              {t("pageDescription")}
            </p>
          </div>

          {/* ユーザー依存の本体(認証・プリセット・生成結果)をストリーミング */}
          <Suspense fallback={<StylePageBodyFallback />}>
            <StylePageBody searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/** StylePageBody の読み込み中スケルトン(残高バー + カード列 + フォーム想定)。 */
function StylePageBodyFallback() {
  return (
    <div className="space-y-8">
      <div className="h-16 w-64 animate-pulse rounded-lg bg-gray-200" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[240px] w-[180px] shrink-0 animate-pulse rounded-xl bg-gray-200"
          />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-gray-200" />
    </div>
  );
}
