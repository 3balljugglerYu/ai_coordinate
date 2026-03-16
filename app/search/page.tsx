import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { CachedSearchPostList } from "@/features/posts/components/CachedSearchPostList";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getSiteUrl } from "@/lib/env";
import { getUser } from "@/lib/auth";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { getSearchCopy } from "@/i18n/page-copy";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getSearchCopy(locale);
  const params = await searchParams;
  const searchQuery = params.q?.trim();

  const title = searchQuery
    ? copy.resultTitle.replace("{query}", searchQuery)
    : copy.defaultTitle;
  const description = searchQuery
    ? copy.resultDescription.replace("{query}", searchQuery)
    : copy.defaultDescription;

  const siteUrl = getSiteUrl();
  const searchUrl = siteUrl
    ? `${siteUrl}${localizePublicPath("/search", locale)}${
        searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""
      }`
    : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: searchUrl,
      siteName: "Persta.AI",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getSearchCopy(locale);
  const params = await searchParams;
  const searchQuery = params.q?.trim() || "";
  const sortType = params.sort || "popular";
  const user = await getUser();
  const userId = user?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 md:pt-8">
      {/* 検索結果 */}
      {!searchQuery || !searchQuery.trim() ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            {copy.emptyQuery}
          </p>
        </div>
      ) : (
        <Suspense fallback={<PostListSkeleton />}>
          <CachedSearchPostList
            searchQuery={searchQuery.trim()}
            sortType={sortType}
            userId={userId}
          />
        </Suspense>
      )}
    </div>
  );
}
