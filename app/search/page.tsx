import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { getSiteUrl } from "@/lib/env";
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

export default async function SearchPage() {
  // 検索は一時的に無効化している。UI の導線は StickyHeader で閉じているが、
  // ブックマークやクローラーが直接この URL を叩くとループが再現するため、
  // ページ側でもホームへ逃がす。
  //
  // 経緯: PostList の初回ロード useEffect が loadedSearchQuery / loadedSortType を
  // 依存に持ちながら loadPosts 内でそれらを更新するため、検索クエリがあると
  // 止まらずリクエストを投げ続ける。Vercel が 503 を返し、画面はスケルトンのまま
  // 固まる。
  //
  // 復帰させるときは、この関数を git 履歴から戻し、StickyHeader の
  // SEARCH_ENABLED も true にすること。
  redirect("/");
}
