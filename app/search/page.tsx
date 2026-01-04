import { Suspense } from "react";
import type { Metadata } from "next";
import { PostList } from "@/features/posts/components/PostList";
import { getPosts } from "@/features/posts/lib/server-api";
import { PostListSkeleton } from "@/features/posts/components/PostListSkeleton";
import { getSiteUrl } from "@/lib/env";
import type { SortType } from "@/features/posts/types";
import { isValidSortType } from "@/features/posts/lib/utils";

export const metadata: Metadata = {
  title: "検索 - Persta.AI",
  description: "プロンプトを検索して、AIで生成されたファッションコーディネートを見つけましょう",
  openGraph: {
    title: "検索 - Persta.AI",
    description: "プロンプトを検索して、AIで生成されたファッションコーディネートを見つけましょう",
    url: getSiteUrl() ? `${getSiteUrl()}/search` : undefined,
    siteName: "Persta.AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "検索 - Persta.AI",
    description: "プロンプトを検索して、AIで生成されたファッションコーディネートを見つけましょう",
  },
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

async function PostListContent({ searchQuery, sortType }: { searchQuery?: string; sortType?: string }) {
  // 検索クエリがない場合は空配列を返す（PostListコンポーネントで空の状態メッセージを表示）
  if (!searchQuery || !searchQuery.trim()) {
    return null;
  }

  // デフォルトはpopularソート
  const sort: SortType = (sortType && isValidSortType(sortType)) ? sortType : "popular";
  const posts = await getPosts(20, 0, sort, searchQuery);
  return <PostList initialPosts={posts} />;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const searchQuery = params.q?.trim() || undefined;
  // デフォルトはpopularソート
  const sortType = params.sort || "popular";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-1">
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

