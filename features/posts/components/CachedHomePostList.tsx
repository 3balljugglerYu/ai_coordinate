import { cacheLife, cacheTag } from "next/cache";
import { getPosts } from "../lib/server-api";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
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
  // 付与額を含むため、admin が額や予約を変えたら一緒に作り直す。
  // 付けないと、投稿モーダルの還元案内が旧額のまま残る
  cacheTag("percoin-defaults");
  cacheLife("minutes");

  const [newestPosts, weekPosts, percoinDefaults] = await Promise.all([
    getPosts(20, 0, "newest", undefined, userId),
    getPosts(20, 0, "week", undefined, userId),
    // 付与モーダルの還元案内で使う。文言に焼き込まず設定値を出す
    // (額を変えたときに嘘にならないように)
    getPercoinDefaultsForDisplay(),
  ]);

  return (
    <PostList
      initialPosts={newestPosts}
      initialPostsForWeek={weekPosts}
      forceInitialLoading={false}
      skipInitialFetch
      // viewable インプレッション計測はホームフィードのみ有効(検索等では計測しない)
      trackImpressions
      promptUsageRewardAmount={percoinDefaults.promptUsageRewardAmount}
    />
  );
}
