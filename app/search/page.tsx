import { Suspense } from "react";
import type { Metadata } from "next";
import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getSiteUrl } from "@/lib/env";
import type { SortType } from "@/features/posts/types";
import { isValidSortType } from "@/features/posts/lib/utils";

const DEFAULT_TITLE = "検索 - Persta.AI";
const DEFAULT_DESCRIPTION =
  "プロンプトを検索して、好きなファッションやキャラクターを見つけましょう";

interface SearchPageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const searchQuery = params.q?.trim();

  const title = searchQuery
    ? `${searchQuery}の検索結果 - Persta.AI`
    : DEFAULT_TITLE;
  const description = searchQuery
    ? `「${searchQuery}」のコーデ・ファッション・キャラクター画像を検索。Persta.AIでみんなの作品を見つけましょう。`
    : DEFAULT_DESCRIPTION;

  const siteUrl = getSiteUrl();
  const searchUrl = siteUrl
    ? `${siteUrl}/search${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}`
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

async function PostListContent({ searchQuery, sortType }: { searchQuery: string; sortType: string }) {
  // デフォルトはpopularソート
  const sort: SortType = isValidSortType(sortType) ? sortType : "popular";
  const posts = await getPosts(20, 0, sort, searchQuery);
  return <PostList initialPosts={posts} />;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() || undefined;
  // デフォルトはpopularソート
  const sortType = params.sort || "popular";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-6 md:pt-8">
      {/* 検索結果 */}
      {!searchQuery || !searchQuery.trim() ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground">
            検索キーワードを入力してください
          </p>
        </div>
      ) : (
        <Suspense fallback={<PostListSkeleton />}>
          <PostListContent searchQuery={searchQuery} sortType={sortType} />
        </Suspense>
      )}
    </div>
  );
}

