import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSiteUrl } from "@/lib/env";
import { getUser } from "@/lib/auth";
import { getPublicBanners } from "@/features/banners/lib/get-banners";
import { HomeBannerList } from "@/features/home/components/HomeBannerList";
import { HomeHeading } from "@/features/home/components/HomeHeading";
import { CachedHomePostList } from "@/features/posts/components/CachedHomePostList";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import {
  createLocaleAlternates,
  getDefaultOpenGraphImages,
  getDefaultTwitterImages,
} from "@/lib/metadata";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { getHomeCopy } from "@/i18n/page-copy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getHomeCopy(locale);
  const siteUrl = getSiteUrl();
  const localizedPath = localizePublicPath("/", locale);
  const localizedUrl = siteUrl ? `${siteUrl}${localizedPath}` : localizedPath;

  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
    alternates: createLocaleAlternates("/", locale),
    openGraph: {
      title: copy.metadataTitle,
      description: copy.metadataDescription,
      url: localizedUrl,
      siteName: "Persta.AI",
      type: "website",
      images: getDefaultOpenGraphImages(siteUrl),
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metadataTitle,
      description: copy.metadataDescription,
      images: getDefaultTwitterImages(siteUrl),
    },
  };
}

async function HomePageContent({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await connection();
  const { locale: localeParam } = await params;
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE;
  const copy = getHomeCopy(locale);
  const user = await getUser();
  const userId = user?.id ?? null;
  const siteUrl = getSiteUrl() || "https://persta.ai";
  const banners = await getPublicBanners();

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Persta.AI",
    "alternateName": ["Persta", "ペルスタ"],
    "url": siteUrl,
    "logo": `${siteUrl}/icons/icon-512.png`,
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Persta.AI",
    "alternateName": ["Persta", "ペルスタ"],
    "url": siteUrl,
    "description": copy.organizationDescription,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema),
        }}
      />
      <HomeBannerList banners={banners} />
      <Suspense fallback={<PostListSkeleton />}>
        <CachedHomePostList userId={userId} />
      </Suspense>
    </>
  );
}

function HomePageSkeleton() {
  return (
    <>
      <div className="mb-8 overflow-x-hidden">
        <div className="-mx-4 px-4">
          <div className="aspect-[3/1] w-full animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
      <PostListSkeleton />
    </>
  );
}

export default function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return (
    <div className="mx-auto max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8">
      <HomeHeading />
      <Suspense fallback={<HomePageSkeleton />}>
        <HomePageContent params={params} />
      </Suspense>
    </div>
  );
}
