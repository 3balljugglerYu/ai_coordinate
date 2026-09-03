import { cacheLife, cacheTag } from "next/cache";
import { getPosts } from "../lib/server-api";
import { getPopularPrompts } from "../lib/popular-prompts-api";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
import { PostList, type MiddleSort } from "./PostList";

/**
 * ホーム画面用の投稿一覧（use cache でサーバーキャッシュ）
 * 新着・中間タブの両方をキャッシュし、初回表示を高速化
 * userId を引数で受け取り、cookies/headers を use cache 内で使わない
 *
 * ⭐ `popularPromptsAvailable` は呼び出し側（`CachedHomePostListSection`）で
 * 確定させて受け取る。`"use cache"` の引数はそのままキャッシュキーになるので、
 * true / false でエントリが分かれ、**一般ユーザーの SSR HTML に人気投稿の配列が
 * 混ざらない**。Loader はクライアントの後段昇格なので、ここの取得可否は決められない。
 */
export async function CachedHomePostList({
  userId,
  popularPromptsAvailable,
}: {
  userId: string | null;
  popularPromptsAvailable: boolean;
}) {
  "use cache";
  cacheTag("home-posts");
  cacheTag("home-posts-week");
  cacheTag("popular-prompts");
  // 付与額を含むため、admin が額や予約を変えたら一緒に作り直す。
  // 付けないと、投稿モーダルの還元案内が旧額のまま残る
  cacheTag("percoin-defaults");
  cacheLife("minutes");

  const [newestPosts, middlePosts, percoinDefaults] = await Promise.all([
    getPosts(20, 0, "newest", undefined, userId),
    /*
      中間タブの初期データ。可否によって中身が変わる。
      全公開までは week（オススメ）がまだ存在するので、false 側は自然に
      これまでどおりのデータが入る。Phase 6 で week を消すときに
      false 側の分岐ごと畳める。
    */
    popularPromptsAvailable
      ? getPopularPrompts(20, 0, userId)
      : getPosts(20, 0, "week", undefined, userId),
    // 付与モーダルの還元案内で使う。文言に焼き込まず設定値を出す
    // (額を変えたときに嘘にならないように)
    getPercoinDefaultsForDisplay(),
  ]);

  /*
    `initialPosts` は**既定タブの配列**、`initialMiddlePosts` はもう一方の配列。
    運営: 既定=PICK UP / もう一方=新着
    一般: 既定=新着   / もう一方=オススメ(week)
  */
  const initialPosts = popularPromptsAvailable ? middlePosts : newestPosts;
  const secondaryPosts = popularPromptsAvailable ? newestPosts : middlePosts;
  const initialMiddleSort: MiddleSort = popularPromptsAvailable
    ? "newest"
    : "week";
  /*
    ⭐ 既定タブはサーバーで決めてから渡す。可否は ADMIN_USER_IDS
    （サーバー専用）に依存するので、クライアントで決めると Provider の
    後段昇格まで false に倒れ、描画後にタブが飛ぶ。

    PICK UP が使えない一般ユーザーは従来どおり新着で開く。
  */
  const initialDefaultSort = popularPromptsAvailable
    ? ("popular_prompts" as const)
    : ("newest" as const);

  return (
    <PostList
      initialPosts={initialPosts}
      initialMiddlePosts={secondaryPosts}
      initialMiddleSort={initialMiddleSort}
      initialDefaultSort={initialDefaultSort}
      forceInitialLoading={false}
      skipInitialFetch
      // viewable インプレッション計測はホームフィードのみ有効(検索等では計測しない)
      trackImpressions
      promptUsageRewardAmount={percoinDefaults.promptUsageRewardAmount}
    />
  );
}
