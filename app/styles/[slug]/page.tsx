import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ChevronRight, Wand2 } from "lucide-react";
import {
  getPublishedStylePresets,
  getPublishedStylePresetBySlugPublic,
} from "@/features/style-presets/lib/get-public-style-presets";
import { PublicStyleCard } from "@/features/style-presets/components/PublicStyleCard";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import {
  createLocaleAlternates,
  getDefaultTwitterImages,
} from "@/lib/metadata";
import { getStylesCopy } from "@/i18n/page-copy";
import { getSiteUrl } from "@/lib/env";

// locale は cookie 依存の getLocale() ではなく URL パラメータから解決する。
// これによりページ全体が静的プリレンダ可能になり、JSON-LD が初期 HTML に含まれる
// (getLocale はリクエスト依存の動的 API のため PPR の静的シェルから外れてしまう)。
// ロケール無しの /styles/[slug] 直アクセスは proxy が /{locale}/... へリダイレクトする。
interface PageProps {
  params: Promise<{ slug: string; locale?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getStylesCopy(locale);

  const preset = await getPublishedStylePresetBySlugPublic(slug);
  if (!preset) {
    return { title: copy.indexTitle };
  }

  const siteUrl = getSiteUrl();
  const title = `${preset.title} | ${copy.detailTitleSuffix}`;
  const description = copy.detailDescription.replaceAll(
    "{title}",
    preset.title
  );
  const localizedPath = localizePublicPath(`/styles/${slug}`, locale);
  const url = siteUrl ? `${siteUrl}${localizedPath}` : undefined;
  const ogTitle = `${preset.title} | Persta.AI`;

  return {
    title,
    description,
    alternates: createLocaleAlternates(`/styles/${slug}`, locale),
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: "Persta.AI",
      type: "website",
      images: [
        {
          url: preset.thumbnailImageUrl,
          width: preset.thumbnailWidth,
          height: preset.thumbnailHeight,
          alt: ogTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: preset.thumbnailImageUrl
        ? [preset.thumbnailImageUrl]
        : getDefaultTwitterImages(siteUrl),
    },
  };
}

export default async function StyleDetailPage({ params }: PageProps) {
  const { slug, locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getStylesCopy(locale);

  const preset = await getPublishedStylePresetBySlugPublic(slug);
  if (!preset) {
    notFound();
  }

  const categoryName =
    locale === "ja"
      ? preset.category.displayNameJa
      : preset.category.displayNameEn;
  const providerName = preset.providerNickname ?? preset.category.providerNickname;
  const description = copy.detailDescription.replaceAll(
    "{title}",
    preset.title
  );
  const stylesIndexPath = localizePublicPath("/styles", locale);
  const generatePath = `${localizePublicPath("/style", locale)}?style=${preset.id}`;

  const allPresets = await getPublishedStylePresets();
  const relatedPresets = allPresets
    .filter(
      (candidate) =>
        candidate.category.key === preset.category.key &&
        candidate.id !== preset.id
    )
    .slice(0, 8);

  // HomeStructuredData と同じ方針: 環境変数未設定時も既定ドメインで JSON-LD を出す
  const siteUrl = getSiteUrl() || "https://persta.ai";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Persta.AI",
          item: `${siteUrl}${localizePublicPath("/", locale)}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: copy.indexHeading,
          item: `${siteUrl}${stylesIndexPath}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: preset.title,
          item: `${siteUrl}${localizePublicPath(`/styles/${slug}`, locale)}`,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ImageObject",
      contentUrl: preset.thumbnailImageUrl,
      name: preset.title,
      description,
      ...(providerName
        ? { creator: { "@type": "Person", name: providerName } }
        : {}),
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-6 md:pt-8">
        {/* パンくず: 内部リンクとして Home / styles 一覧への導線を明示する */}
        <nav
          aria-label="Breadcrumb"
          className="mb-5 flex flex-wrap items-center gap-1 text-xs text-gray-500 md:text-sm"
        >
          <Link
            href={localizePublicPath("/", locale)}
            className="hover:text-gray-800 hover:underline"
          >
            Persta.AI
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden />
          <Link
            href={stylesIndexPath}
            className="hover:text-gray-800 hover:underline"
          >
            {copy.indexHeading}
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 rtl:rotate-180" aria-hidden />
          <span className="text-gray-800">{preset.title}</span>
        </nav>

        <div className="grid gap-6 md:grid-cols-2 md:gap-10">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm">
            <Image
              src={preset.thumbnailImageUrl}
              alt={preset.title}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 448px"
              className="object-cover object-top"
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <span
                className="inline-block rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  backgroundColor: preset.category.badgeColor,
                  color: preset.category.badgeTextColor,
                }}
              >
                {categoryName}
              </span>
              <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
                {preset.title}
              </h1>
              {providerName && (
                <p className="text-sm text-gray-500">
                  {copy.providerLabel.replace("{name}", providerName)}
                </p>
              )}
            </div>

            <p className="text-sm leading-relaxed text-gray-600 md:text-base">
              {description}
            </p>

            <Link
              href={generatePath}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(236,72,153,0.35)] transition-transform hover:scale-[1.02] motion-reduce:transition-none"
            >
              <Wand2 className="h-4 w-4" aria-hidden />
              {copy.cta}
            </Link>
          </div>
        </div>

        {relatedPresets.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-bold text-gray-900 md:text-xl">
              {copy.related}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
              {relatedPresets.map((related) => (
                <PublicStyleCard
                  key={related.id}
                  preset={related}
                  locale={locale}
                />
              ))}
            </div>
          </section>
        )}

        <div className="mt-10">
          <Link
            href={stylesIndexPath}
            className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            {copy.allStyles}
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
