/**
 * User ORIGINAL(/user-styles)の一覧取得。
 *
 * 並び・除外・ページング・投稿本体の射影は **`get_user_style_page` の1文**が
 * すべて行う。ここでスコアや可否を計算し直したり、ID を受け取ってから投稿本体を
 * 別クエリで引いたりしてはいけない（`popular-prompts-api.ts` 冒頭に記録された
 * 2つの失敗と同型。計画書 ADR-002）。
 *
 *   - 取得後に絞ると、20件取って数件落とした時点で hasMore が false になり穴が空く
 *   - 2文に分けると、その間の投稿取消・モデレーション・ブロック・通報で除外が効かない
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { enrichPosts } from "@/features/posts/lib/server-api";
import {
  USER_STYLE_PAGE_SIZE,
} from "@/features/user-styles/lib/constants";
import type {
  UserStyleCursor,
  UserStylePage,
  UserStyleSort,
} from "@/features/user-styles/types";

interface PageRow {
  /** 投稿行そのもの（RPC が to_jsonb で返す）。PostgREST の select=* と同じ形。 */
  post: GeneratedImageRecord;
  usage_count: number;
  /** `usage` 並びのときだけ。確定順位(get_user_style_usage_page)。 */
  rank_position?: number;
}

export interface GetUserStylePageParams {
  limit?: number;
  sort?: UserStyleSort;
  /** 作者チップで絞るとき。null なら全作者。 */
  authorId?: string | null;
  /**
   * ハッシュタグ企画のタブで絞るとき(hashtag_campaigns.key)。null なら絞らない。
   * 指定したときは新着順だけ(並び・作者の指定は使わない。チップは排他)。2026-10-16 ユーザー指示
   */
  campaignKey?: string | null;
  /**
   * 2ページ目以降。並びと形を合わせること(`newest` は `{ postedAt, id }`、
   * `usage` は `{ position }`)。合わないものは無視して先頭から読む ── 呼び出し側
   * (route)が先に弾いている前提。
   */
  cursor?: UserStyleCursor | null;
  /**
   * 閲覧者。**必ずサーバー側の `getUser()` から解決した値**を渡すこと。
   * クライアントから受け取った値を渡してはならない（ブロック・通報の除外基準になる）。
   */
  currentUserId?: string | null;
}

/** 読み出しに失敗したことを表す。キャッシュ層が「空」を覚えないよう、空とは区別する。 */
export class UserStylePageFetchError extends Error {
  constructor(readonly code: string | undefined) {
    super(`User styles page fetch failed (${code ?? "unknown"})`);
    this.name = "UserStylePageFetchError";
  }
}

/**
 * 1ページ取得する。
 *
 * **読めなければ空（fail closed）。** 呼び出し側は空状態を出す。
 * 人気タブのように新着順へフォールバックしない ── この画面は新着順が既定なので、
 * 失敗時に同じものへ倒しても「失敗した」ことが分からなくなるだけ。
 */
export async function getUserStylePage(
  params: GetUserStylePageParams = {}
): Promise<UserStylePage> {
  try {
    return await fetchUserStylePage(params);
  } catch (error) {
    if (error instanceof UserStylePageFetchError) {
      return { posts: [], nextCursor: null };
    }
    throw error;
  }
}

/**
 * 1ページ取得する。読めなければ `UserStylePageFetchError` を投げる。
 *
 * `"use cache"` の中ではこちらを使うこと。空を返すと、一時的な失敗が
 * 「空の一覧」としてキャッシュの寿命のあいだ全員に出続ける。
 */
export async function fetchUserStylePage({
  limit = USER_STYLE_PAGE_SIZE,
  sort = "newest",
  authorId = null,
  campaignKey = null,
  cursor = null,
  currentUserId = null,
}: GetUserStylePageParams = {}): Promise<UserStylePage> {
  const supabase = createAdminClient();

  /*
    🎃 ハッシュタグ企画の対象作品(2026-10-16)。掲載条件は「すべて」と同じで、
    応募作の記録にありタグが付いたままの投稿を新着順に。絞り込みも1文の中で行う
    (get_user_style_campaign_page。取得後に絞らない理由はこのファイルの冒頭と同じ)。
  */
  if (campaignKey) {
    const { data, error } = await supabase.rpc("get_user_style_campaign_page", {
      p_viewer_id: currentUserId,
      p_campaign_key: campaignKey,
      p_limit: limit,
      p_cursor_posted_at: cursor && "postedAt" in cursor ? cursor.postedAt : null,
      p_cursor_id: cursor && "id" in cursor ? cursor.id : null,
    });
    if (error) {
      console.error("User styles campaign page fetch failed:", { code: error.code });
      throw new UserStylePageFetchError(error.code);
    }
    return toPage((data ?? []) as PageRow[], "newest", limit, supabase);
  }

  /*
    👑 よく使われる は、毎時確定する順位(user_style_usage_rankings)を順位で
    20件ずつ読む(2026-10-01 にページング化。以前は上限 40 件を1回で返し切る設計で、
    該当が増えて上位より先が消えていた)。作者で絞る組み合わせは無い(チップは排他)。
  */
  const { data, error } =
    sort === "usage"
      ? await supabase.rpc("get_user_style_usage_page", {
          p_viewer_id: currentUserId,
          p_limit: limit,
          p_cursor_position:
            cursor && "position" in cursor ? cursor.position : null,
        })
      : await supabase.rpc("get_user_style_page", {
          p_viewer_id: currentUserId,
          p_limit: limit,
          p_sort: sort,
          p_author_id: authorId,
          p_cursor_posted_at:
            cursor && "postedAt" in cursor ? cursor.postedAt : null,
          p_cursor_id: cursor && "id" in cursor ? cursor.id : null,
        });

  if (error) {
    console.error("User styles page fetch failed:", { code: error.code });
    throw new UserStylePageFetchError(error.code);
  }

  return toPage((data ?? []) as PageRow[], sort, limit, supabase);
}

/** RPC の行を一覧の1ページにする(投稿の付け足しと、次ページの cursor) */
async function toPage(
  rows: PageRow[],
  sort: UserStyleSort,
  limit: number,
  supabase: ReturnType<typeof createAdminClient>
): Promise<UserStylePage> {
  if (rows.length === 0) {
    return { posts: [], nextCursor: null };
  }

  // RPC が既に正しい順序で返しているので、並べ替え直さない。
  const orderedRows = rows.map((row) => row.post);
  const posts = await enrichPosts(orderedRows, undefined, supabase);

  return { posts, nextCursor: resolveNextCursor(rows, sort, limit) };
}

/**
 * 次ページの cursor を最後の行から作る。
 *
 * - `newest`: 最後の行の `(posted_at, id)`
 * - `usage`: 最後の行の確定順位。順位は毎時確定して固定されているので、
 *   順位で境界を決めればページ境界で重複・欠落しない
 *
 * ⭐ **`enrichPosts` の結果からではなく RPC の生の行から作る。** enrich は
 * 別テーブルを引いて付け足すだけだが、cursor は RPC が並べた値そのもので
 * なければならない。加工を挟むと「境界がずれない」という保証の根拠が消える。
 */
function resolveNextCursor(
  rows: PageRow[],
  sort: UserStyleSort,
  limit: number
): UserStyleCursor | null {
  // limit に満たなければ最後のページ。
  if (rows.length < limit) {
    return null;
  }
  if (sort === "usage") {
    const position = rows[rows.length - 1]?.rank_position;
    return typeof position === "number" ? { position } : null;
  }
  const last = rows[rows.length - 1]?.post;
  if (!last?.id || !last?.posted_at) {
    return null;
  }
  return { postedAt: last.posted_at, id: last.id };
}
