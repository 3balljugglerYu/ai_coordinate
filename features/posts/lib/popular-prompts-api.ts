/**
 * 🔥人気のプロンプト タブのデータ取得。
 *
 * 順位は pg_cron が `popular_prompt_rankings` に事前計算したものを読むだけで、
 * ここでスコアを計算し直すことはしない（ADR-001）。減衰に now() を使う以上、
 * リクエストのたびに計算すると 2 ページ目が別の順序になり、無限スクロールで
 * 重複・抜けが出るためである。
 *
 * スコア定義の正本は docs/planning/popular-prompts-tab-implementation-plan.md §5。
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { Post } from "../types";
import { buildPostSelect, stripHashtagJoin } from "./search-filters";
import { enrichPosts, getPosts } from "./server-api";

/**
 * 順位テーブルがこれより古ければ、順位を信用せず新着順へ倒す。
 *
 * cron は毎時なので、通常は最大 1 時間。3 時間空いたということは
 * cron が止まっている（または無効のまま）ということなので、
 * 固まった順位を出し続けるより新着順の方がまだ役に立つ。
 */
export const POPULAR_PROMPTS_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

type RankingRow = {
  post_id: string;
  rank_position: number;
  is_new: boolean;
};

/**
 * 人気のプロンプト一覧を順位順に取得する。
 *
 * ⭐ 除外（ブロック・通報・非公開）は DB 側で LIMIT より前に適用している。
 *    ここで取得後に絞ると、20 件取って数件落とした時点で hasMore=false になり
 *    一覧に穴が空く。フィルタは `get_popular_prompt_page` RPC の中にある。
 *
 * @param currentUserId 閲覧者。**必ずサーバー側の getUser() から解決した値**を渡すこと。
 *                      クライアントから受け取った値を渡してはならない。
 */
export async function getPopularPrompts(
  limit = 20,
  offset = 0,
  currentUserId: string | null = null
): Promise<Post[]> {
  // popular_prompt_rankings は RLS 全拒否なので service_role でしか読めない。
  const supabase = createAdminClient();

  // 鮮度チェック。全行が同じ computed_at を持つので 1 行見れば足りる。
  const { data: freshness, error: freshnessError } = await supabase
    .from("popular_prompt_rankings")
    .select("computed_at")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (freshnessError) {
    console.error("Popular prompts freshness check failed:", freshnessError);
    return getPosts(limit, offset, "newest", undefined, currentUserId);
  }

  const computedAt = freshness?.computed_at
    ? new Date(freshness.computed_at as string).getTime()
    : null;

  if (computedAt === null || Number.isNaN(computedAt)) {
    // 一度も計算されていない（cron 未有効・初回デプロイ直後）
    console.error("Popular prompts ranking is empty; falling back to newest");
    return getPosts(limit, offset, "newest", undefined, currentUserId);
  }

  if (Date.now() - computedAt > POPULAR_PROMPTS_STALE_AFTER_MS) {
    console.error(
      `Popular prompts ranking is stale (computed_at=${new Date(
        computedAt
      ).toISOString()}); falling back to newest`
    );
    return getPosts(limit, offset, "newest", undefined, currentUserId);
  }

  const { data: rankingRows, error: rankingError } = await supabase.rpc(
    "get_popular_prompt_page",
    {
      p_viewer_id: currentUserId,
      p_limit: limit,
      p_offset: offset,
    }
  );

  if (rankingError) {
    console.error("Popular prompts ranking fetch failed:", rankingError);
    return getPosts(limit, offset, "newest", undefined, currentUserId);
  }

  const ranking = (rankingRows ?? []) as RankingRow[];
  if (ranking.length === 0) {
    return [];
  }

  const orderedIds = ranking.map((row) => row.post_id);
  const newPostIds = new Set(
    ranking.filter((row) => row.is_new).map((row) => row.post_id)
  );

  // 本文は RPC の結果に含めていないので、投稿行はここで引く。
  // 件数は 1 ページ分（最大 100）なので PostgREST の行上限に当たらない。
  const { data: postsData, error: postsError } = await supabase
    .from("generated_images")
    .select(buildPostSelect(null))
    .in("id", orderedIds);

  if (postsError) {
    console.error("Popular prompts posts fetch failed:", postsError);
    return getPosts(limit, offset, "newest", undefined, currentUserId);
  }

  // `.in()` は順序を保証しないため、順位テーブルの並びへ戻す。
  const rowById = new Map(
    stripHashtagJoin(postsData).map((row) => [row.id, row])
  );
  const orderedRows = orderedIds
    .map((id) => rowById.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const enriched = await enrichPosts(orderedRows, undefined, supabase);

  return enriched.map((post) => ({
    ...post,
    isNew: post.id ? newPostIds.has(post.id) : false,
  }));
}
