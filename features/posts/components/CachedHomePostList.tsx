import { cacheLife, cacheTag } from "next/cache";
import { getPosts } from "../lib/server-api";
import { PostList } from "./PostList";

/**
 * ホーム画面用の投稿一覧（use cache でサーバーキャッシュ）
 * 新着・オススメの両方をキャッシュし、初回表示を高速化
 * userId を引数で受け取り、cookies/headers を use cache 内で使わない
 */
export async function CachedHomePostList({ userId }: { userId: string | null }) {
  "use cache";
  cacheTag("home-posts");
  cacheTag("home-posts-week");
  cacheLife("minutes");

  const [newestPosts, weekPosts] = await Promise.all([
    getPosts(20, 0, "newest", undefined, userId),
    getPosts(20, 0, "week", undefined, userId),
  ]);

  return (
    <PostList
      initialPosts={newestPosts}
      initialPostsForWeek={weekPosts}
      forceInitialLoading={false}
      skipInitialFetch
    />
  );
}
