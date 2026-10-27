import type { SupabaseClient } from "@supabase/supabase-js";

/** 閲覧者に見せてよいかを決めるのに要る、投稿の列。 */
export interface PostViewerGateRow {
  id: string;
  user_id: string | null;
  is_posted: boolean | null;
  moderation_status: string | null;
}

/**
 * 投稿をこの閲覧者に見せてよいか（投稿詳細と同じ決まり。`getPost` から切り出した）。
 *
 * - 未投稿は本人（と運営）だけ
 * - 公開停止・審査中は運営だけ。ただし本人は自分の審査中（pending）を見られる。removed は本人にも出さない
 * - ログイン中は、投稿者とのブロック（どちら向きでも）と、自分が通報した投稿を出さない
 *
 * ⚠️ 投稿詳細と、詳細の一部だけを返す API（`/api/posts/[id]/source-reference` など）で
 * 決まりが食い違わないよう、ここ1か所に置く。条件を写さないこと。
 */
export async function canViewerSeePost(
  supabase: SupabaseClient,
  row: PostViewerGateRow,
  viewerId: string | null | undefined,
  isFullAdminViewer: boolean
): Promise<boolean> {
  const isPostOwner = !!viewerId && row.user_id === viewerId;

  if (!row.is_posted && !isPostOwner && !isFullAdminViewer) {
    return false;
  }

  if (
    row.is_posted &&
    row.moderation_status &&
    row.moderation_status !== "visible" &&
    !isFullAdminViewer
  ) {
    // 投稿者本人は自分の pending 投稿を閲覧できる（フィードから消えていることに気づかせる）。
    // ただし removed は本人にも表示しない。
    const isOwnerPending = isPostOwner && row.moderation_status === "pending";
    if (!isOwnerPending) {
      return false;
    }
  }

  if (viewerId && row.user_id && !isFullAdminViewer) {
    const [{ data: blockAsBlocker }, { data: blockAsBlocked }, { data: reportRow }] =
      await Promise.all([
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", viewerId)
          .eq("blocked_id", row.user_id)
          .maybeSingle(),
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", row.user_id)
          .eq("blocked_id", viewerId)
          .maybeSingle(),
        supabase
          .from("post_reports")
          .select("id")
          .eq("reporter_id", viewerId)
          .eq("post_id", row.id)
          .maybeSingle(),
      ]);

    if (blockAsBlocker || blockAsBlocked || reportRow) {
      return false;
    }
  }

  return true;
}
