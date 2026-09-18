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
import { createAdminClient } from "@/lib/supabase/admin";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { enrichPosts } from "@/features/posts/lib/server-api";
import type {
  UserStyleCursor,
  UserStylePage,
  UserStyleSort,
} from "@/features/user-styles/types";

/** 1ページの既定件数。ホームのフィード（/api/posts）と揃える。 */
export const USER_STYLE_PAGE_SIZE = 20;

/**
 * 1回で取れる上限。**RPC 側の `p_limit` 制約（1..40）と同じ値にすること。**
 * 超えると RPC が例外を投げる（黙って丸めない設計）。
 */
export const USER_STYLE_PAGE_MAX = 40;

interface PageRow {
  /** 投稿行そのもの（RPC が to_jsonb で返す）。PostgREST の select=* と同じ形。 */
  post: GeneratedImageRecord;
  usage_count: number;
}

export interface GetUserStylePageParams {
  limit?: number;
  sort?: UserStyleSort;
  /** 作者チップで絞るとき。null なら全作者。 */
  authorId?: string | null;
  /** 2ページ目以降。`usage` 並びでは渡してはいけない（RPC が例外を投げる）。 */
  cursor?: UserStyleCursor | null;
  /**
   * 閲覧者。**必ずサーバー側の `getUser()` から解決した値**を渡すこと。
   * クライアントから受け取った値を渡してはならない（ブロック・通報の除外基準になる）。
   */
  currentUserId?: string | null;
}

/**
 * 1ページ取得する。
 *
 * **読めなければ空（fail closed）。** 呼び出し側は空状態を出す。
 * 人気タブのように新着順へフォールバックしない ── この画面は新着順が既定なので、
 * 失敗時に同じものへ倒しても「失敗した」ことが分からなくなるだけ。
 */
export async function getUserStylePage({
  limit = USER_STYLE_PAGE_SIZE,
  sort = "newest",
  authorId = null,
  cursor = null,
  currentUserId = null,
}: GetUserStylePageParams = {}): Promise<UserStylePage> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("get_user_style_page", {
    p_viewer_id: currentUserId,
    p_limit: limit,
    p_sort: sort,
    p_author_id: authorId,
    p_cursor_posted_at: cursor?.postedAt ?? null,
    p_cursor_id: cursor?.id ?? null,
  });

  if (error) {
    console.error("User styles page fetch failed:", { code: error.code });
    return { posts: [], nextCursor: null };
  }

  const rows = (data ?? []) as PageRow[];
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
 * ⭐ **`usage` 並びは常に null。** 利用回数はライブに動くので cursor を足しても
 * 順序を固定できず、ページ境界で重複・欠落が出る。1ページで返し切る設計にしてある
 * （該当件数が上限に近づいたらスナップショット方式へ ── RPC 側のコメント参照）。
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
  if (sort === "usage") {
    return null;
  }
  // limit に満たなければ最後のページ。
  if (rows.length < limit) {
    return null;
  }
  const last = rows[rows.length - 1]?.post;
  if (!last?.id || !last?.posted_at) {
    return null;
  }
  return { postedAt: last.posted_at, id: last.id };
}
