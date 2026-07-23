import type { Metadata } from "next";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { PublicStyleCard } from "@/features/style-presets/components/PublicStyleCard";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { getStylesCopy } from "@/i18n/page-copy";
import { getSiteUrl } from "@/lib/env";

// locale は cookie 依存の getLocale() ではなく URL パラメータから解決する。
// これによりページ全体が静的プリレンダ可能になり、JSON-LD が初期 HTML に含まれる
// (getLocale はリクエスト依存の動的 API のため PPR の静的シェルから外れてしまう)。
// ロケール無しの /styles 直アクセスは proxy が /{locale}/styles へリダイレクトする。
interface StylesIndexPageProps {
  params: Promise<{ locale?: string }>;
}

export async function generateMetadata({
  params,
}: StylesIndexPageProps): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getStylesCopy(locale);

  return createMarketingPageMetadata({
    title: copy.indexTitle,
    description: copy.indexDescription,
    path: "/styles",
    locale,
    // indexTitle にはブランド名が含まれるため、OG 側は見出しをベースにする
    // (createMarketingPageMetadata が "| Persta.AI" を付与する)
    ogTitle: copy.indexHeading,
  });
}

export default async function StylesIndexPage({
  params,
}: StylesIndexPageProps) {
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getStylesCopy(locale);
  const presets = await getPublishedStylePresets();
  // HomeStructuredData と同じ方針: 環境変数未設定時も既定ドメインで JSON-LD を出す
  const siteUrl = getSiteUrl() || "https://persta.ai";

  // ItemList: 検索エンジンに一覧とスタイル紹介ページの関係を伝える
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.indexHeading,
    itemListElement: presets.slice(0, 50).map((preset, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: preset.title,
      url: `${siteUrl}${localizePublicPath(`/styles/${preset.slug}`, locale)}`,
    })),
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:pt-8">
        <header className="mb-6 space-y-2 md:mb-8">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            {copy.indexHeading}
          </h1>
          <p className="max-w-3xl text-sm text-gray-600 md:text-base">
            {copy.indexIntro}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {presets.map((preset) => (
            <PublicStyleCard key={preset.id} preset={preset} locale={locale} />
          ))}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
    </main>
  );
}
