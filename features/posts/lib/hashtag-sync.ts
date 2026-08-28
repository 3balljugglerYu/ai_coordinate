import { createAdminClient } from "@/lib/supabase/admin";
import { extractHashtags } from "@/lib/hashtag";

/**
 * キャプションのハッシュタグを post_hashtags へ同期する。
 *
 * 投稿を作る経路は 3 つあり（新規投稿 / キャプション編集 / 完走フィード投稿）、
 * どれもこの関数を通す。1 箇所でも漏らすと、その経路で作った投稿だけタグ検索に
 * 出てこない（表示は青くなるので、気づきにくい壊れ方をする）。
 *
 * **失敗しても投稿は成功させる**（REQ-02。投稿ボーナスと同じ方針）。
 * タグが付かないことより、投稿そのものが落ちる方が損失が大きい。
 */

/**
 * 同期失敗のログ接頭辞。
 *
 * 非致命で握りつぶす以上、あとから拾えないと取りこぼしに気づけない。
 * Vercel の Logs でこの文字列を検索すれば失敗した投稿を一覧できる。
 * 復旧は遡り（`POST /api/admin/hashtags/backfill`）を再実行するだけでよい。
 */
export const HASHTAG_SYNC_FAILURE_LOG_PREFIX = "Hashtag sync failed";

export interface SyncPostHashtagsResult {
  /** 同期できたタグ数。失敗・スキップは 0。 */
  syncedCount: number;
  /** キャプションが変わっていたため何もしなかった（後から届いた古い要求）。 */
  skipped: boolean;
}

/**
 * @param postId generated_images.id
 * @param caption **DB に保存された後の**キャプション。RPC 側で現在値と照合するため、
 *   リクエストのボディではなく更新結果の値を渡すこと。
 */
export async function syncPostHashtags(
  postId: string,
  caption: string | null
): Promise<SyncPostHashtagsResult> {
  try {
    const tags = extractHashtags(caption ?? "");
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("sync_post_hashtags", {
      p_post_id: postId,
      p_tags: tags,
      p_expected_caption: caption ?? "",
    });

    if (error) {
      console.error(`${HASHTAG_SYNC_FAILURE_LOG_PREFIX} (rpc)`, {
        postId,
        message: error.message,
      });
      return { syncedCount: 0, skipped: false };
    }

    // -1 は「キャプションが変わっていたので何もしなかった」。
    // 連続編集で起こりうる正常系なのでエラーログにはしない。
    if (data === -1) {
      return { syncedCount: 0, skipped: true };
    }

    return {
      syncedCount: typeof data === "number" ? data : 0,
      skipped: false,
    };
  } catch (error) {
    console.error(`${HASHTAG_SYNC_FAILURE_LOG_PREFIX} (exception)`, {
      postId,
      error,
    });
    return { syncedCount: 0, skipped: false };
  }
}
