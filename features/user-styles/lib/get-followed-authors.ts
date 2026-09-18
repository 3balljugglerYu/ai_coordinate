/**
 * User ORIGINAL(/user-styles)の作者チップ。
 *
 * 閲覧者がフォローしていて、かつ**その閲覧者に実際に見える**掲載対象を
 * 1件以上持つ作者だけを、最新の掲載対象投稿が新しい順に返す。
 *
 * ⭐ 「見える」の判定は `get_user_style_followed_authors` が一覧と同じ
 * 閲覧者基準の除外（双方向ブロック・本人の通報）を通して行う。
 * 可否関数（validate_derived_prompt_source）を通すだけでは足りない
 * ── あちらは通報を一切見ておらず、requester＝原作者にするとブロック判定も
 * 無効化されるため、「チップはあるのに押すと空」が起きる（PR #638 レビュー#3）。
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { USER_STYLE_AUTHOR_CHIP_LIMIT } from "@/features/user-styles/lib/constants";
import type { UserStyleAuthor } from "@/features/user-styles/types";


interface AuthorRow {
  author_id: string;
  nickname: string | null;
  avatar_url: string | null;
  latest_posted_at: string;
}

/**
 * 作者チップを取得する。
 *
 * **未ログインは空配列。** RPC 側も NULL viewer では何も返さないが、
 * 往復を省くためここでも先に返す。
 *
 * **読めなければ空（fail closed）。** チップが出ないだけでページは成立する。
 */
export async function getUserStyleFollowedAuthors(
  currentUserId: string | null,
  limit: number = USER_STYLE_AUTHOR_CHIP_LIMIT
): Promise<UserStyleAuthor[]> {
  if (!currentUserId) {
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "get_user_style_followed_authors",
    { p_viewer_id: currentUserId, p_limit: limit }
  );

  if (error) {
    console.error("User style author chips fetch failed:", { code: error.code });
    return [];
  }

  return ((data ?? []) as AuthorRow[]).map((row) => ({
    authorId: row.author_id,
    nickname: row.nickname,
    avatarUrl: row.avatar_url,
    latestPostedAt: row.latest_posted_at,
  }));
}
