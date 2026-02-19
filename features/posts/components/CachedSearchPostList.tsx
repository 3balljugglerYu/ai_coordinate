import { cacheLife, cacheTag } from "next/cache";
import { getPosts } from "../lib/server-api";
import { PostList } from "./PostList";
import type { SortType } from "../types";
import { isValidSortType } from "../lib/utils";

interface CachedSearchPostListProps {
  searchQuery: string;
  sortType: string;
  userId: string | null;
}

/**
 * 検索画面用の投稿一覧（use cache でサーバーキャッシュ）
 * searchQuery, sortType, userId を引数で受け取り、cookies/headers を use cache 内で使わない
 */
export async function CachedSearchPostList({
  searchQuery,
  sortType,
  userId,
}: CachedSearchPostListProps) {
  "use cache";
  cacheTag("search-posts");
  cacheLife("minutes");

  const sort: SortType = isValidSortType(sortType) ? sortType : "popular";
  const posts = await getPosts(20, 0, sort, searchQuery, userId);

  return (
    <PostList
      initialPosts={posts}
      forceInitialLoading={false}
      skipInitialFetch
    />
  );
}
