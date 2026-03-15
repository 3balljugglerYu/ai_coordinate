import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale } from "next-intl/server";
import { getSiteUrl } from "@/lib/env";
import { getUser } from "@/lib/auth";
import { getPublicBanners } from "@/features/banners/lib/get-banners";
import { HomeBannerList } from "@/features/home/components/HomeBannerList";
import { CachedHomePostList } from "@/features/posts/components/CachedHomePostList";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getHomeCopy } from "@/i18n/page-copy";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getHomeCopy(locale);

  return {
    openGraph: {
      title: copy.metadataTitle,
      description: copy.metadataDescription,
      url: getSiteUrl() || undefined,
      siteName: "Persta.AI",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metadataTitle,
      description: copy.metadataDescription,
    },
  };
}

export default async function Home() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
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
      <div className="mx-auto max-w-6xl px-1 pb-8 pt-6 sm:px-4 md:pt-8">
        <div className="mb-4">
          <h1 className="text-3xl font-bold">{copy.heading}</h1>
          <p className="mt-2 text-muted-foreground">
            {copy.subtitle}
          </p>
        </div>
        <HomeBannerList banners={banners} />
        <Suspense fallback={<PostListSkeleton />}>
          <CachedHomePostList userId={userId} />
        </Suspense>
      </div>
    </>
  );
}
