import { connection } from "next/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { CachedSearchPostList } from "@/features/posts/components/CachedSearchPostList";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getUser } from "@/lib/auth";
import { getSiteUrl, isSearchAvailable } from "@/lib/env";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";
import { createLocaleAlternates } from "@/lib/metadata";
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
    // ?q= 付きの検索結果 URL はクエリ無しの /search に正規化する
    // (クエリごとの薄い重複ページがインデックスされるのを防ぐ)
    alternates: createLocaleAlternates("/search", locale),
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
  await connection();

  /*
    段階公開中は運営だけがこのページを見られる。一般利用者はホームへ逃がす
    （ヘッダーの検索バーも同じ判定で閉じている。ADR-004）。
    一般公開時は NEXT_PUBLIC_SEARCH_ENABLED=true にすれば全員が通る。
  */
  const user = await getUser();
  if (!isSearchAvailable(user?.id)) {
    redirect("/");
  }

  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getSearchCopy(locale);
  const params = await searchParams;
  const searchQuery = params.q?.trim() || "";
  const sortType = params.sort || "popular";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 md:pt-8">
      {!searchQuery ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">{copy.emptyQuery}</p>
        </div>
      ) : (
        <Suspense fallback={<PostListSkeleton />}>
          <CachedSearchPostList
            searchQuery={searchQuery}
            sortType={sortType}
            userId={user?.id ?? null}
          />
        </Suspense>
      )}
    </div>
  );
}
