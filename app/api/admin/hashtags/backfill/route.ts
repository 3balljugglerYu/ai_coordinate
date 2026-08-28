import { connection, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPostHashtags } from "@/features/posts/lib/hashtag-sync";

/**
 * 公開中の投稿のキャプションを読み直し、ハッシュタグを貼り直す（運営専用）。
 *
 * 用途は 2 つ:
 *  - **遡り**: この機能より前に書かれたキャプションからタグを拾う（一度きり）
 *  - **復旧**: 投稿時のタグ同期が失敗した投稿を拾い直す。同期は非致命で握りつぶす
 *    ため、`Hashtag sync failed` のログを見つけたらここを叩けばよい
 *
 * **冪等**。何度実行しても「いまのキャプションと一致した状態」に収束するだけなので、
 * 対象を選ばず全件で回してよい。定期実行は作らない（現規模では数秒で終わる）。
 */

/** 1 回のリクエストで見る投稿の上限。現在の公開投稿は 1,500 件規模。 */
const MAX_POSTS = 5000;

export async function POST() {
  await connection();

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  try {
    const supabase = createAdminClient();

    // caption が無い投稿はタグも無いので読まない。
    // 逆に「タグを消した編集」の取り込みは、その編集自体が同期を通るため不要。
    const { data, error } = await supabase
      .from("generated_images")
      .select("id, caption")
      .eq("is_posted", true)
      .eq("moderation_status", "visible")
      .not("caption", "is", null)
      .order("created_at", { ascending: true })
      .limit(MAX_POSTS);

    if (error) {
      console.error("[Hashtag backfill] fetch failed:", error.message);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    const posts = data ?? [];
    let synced = 0;
    let taggedPosts = 0;

    // 直列に回す。1,500 件規模なら数秒で終わり、並列にして DB を叩く理由がない。
    for (const post of posts) {
      const result = await syncPostHashtags(
        post.id as string,
        (post.caption as string | null) ?? null
      );
      if (result.syncedCount > 0) {
        synced += result.syncedCount;
        taggedPosts += 1;
      }
    }

    return NextResponse.json({
      scannedPosts: posts.length,
      taggedPosts,
      syncedTags: synced,
      truncated: posts.length >= MAX_POSTS,
    });
  } catch (error) {
    console.error("[Hashtag backfill] failed:", error);
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
