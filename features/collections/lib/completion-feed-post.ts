import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadWebPVariants } from "@/features/generation/lib/webp-storage";
import { buildPublicGeneratedImageUrl } from "@/features/collections/lib/public-mount-server-api";

/**
 * 完走(collection_completions)をホームフィードに投稿する(オプトイン)サーバ helper。
 *
 * 流れ(計画 Phase 2 / MRAR-003 反映):
 *  1. 完走の mount_image_path を取得(admin read。所有権は後段 RPC が auth.uid() で強制)。
 *  2. **INSERT 前**に WebP variants を確保(`uploadWebPVariants` は DB 行に依存しない)。
 *     失敗時はここで throw し、generated_images 行を作らない(EARS-07: 部分行を作らない)。
 *  3. RPC `create_collection_completion_post` を**セッションクライアント**経由で呼ぶ
 *     (admin client だと auth.uid() が NULL になり所有権チェックが失敗するため)。
 */
export async function postCompletionToFeed(
  sessionSupabase: SupabaseClient,
  completionId: string,
  caption: string | null,
): Promise<{ postId: string }> {
  // 所有権チェック前に重い WebP 処理が走らないよう、セッションクライアントで読む
  // (collection_completions は本人のみ RLS = 非所有者は data=null で弾かれる)。
  const { data: completion, error } = await sessionSupabase
    .from("collection_completions")
    .select("mount_image_path, mount_status")
    .eq("id", completionId)
    .maybeSingle();

  if (error) throw new Error(`completion fetch failed: ${error.message}`);
  if (!completion) throw new Error("completion not found");
  if (
    completion.mount_status !== "completed" ||
    !completion.mount_image_path
  ) {
    throw new Error("completion not ready");
  }

  const storagePath = completion.mount_image_path as string;
  const imageUrl = buildPublicGeneratedImageUrl(storagePath);
  if (!imageUrl) throw new Error("image url unresolved");

  // INSERT 前に WebP variants を確保(失敗時は投稿しない)。
  const { thumbPath, displayPath } = await uploadWebPVariants(
    imageUrl,
    storagePath,
  );

  const { data: postId, error: rpcError } = await sessionSupabase.rpc(
    "create_collection_completion_post",
    {
      p_completion_id: completionId,
      p_caption: caption,
      p_image_url: imageUrl,
      p_storage_path: storagePath,
      p_storage_path_display: displayPath,
      p_storage_path_thumb: thumbPath,
    },
  );

  if (rpcError) throw new Error(rpcError.message);
  if (!postId) throw new Error("post creation returned no id");
  return { postId: postId as string };
}

/**
 * 完走の台紙を作り直した(表紙変更含む)ときに、既に作成済みの「完走フィード投稿」行の
 * サムネ画像を最新の mount_image_path に貼り替える。
 *
 * 完走フィード投稿は初回投稿時に画像をスナップショットするため、作り直し後もこの helper を
 * 呼ばないと古い表紙のサムネが残る(book/mount 共通の不具合)。投稿行(generated_images)は
 * 完走ごとに最大1行なので、存在すれば画像列を更新する。台紙更新の副作用のため best-effort で
 * 扱い、失敗しても throw しない(呼び出し側の作り直し自体は成功させる)。
 *
 * @returns 更新した投稿行の id(行が無ければ null)。呼び出し側の revalidate 対象に使える。
 */
export async function refreshCompletionFeedPostImage(
  adminSupabase: SupabaseClient,
  completionId: string,
  mountStoragePath: string,
): Promise<{ postId: string | null }> {
  try {
    const { data: existing, error: fetchError } = await adminSupabase
      .from("generated_images")
      .select("id")
      .eq("completion_id", completionId)
      .maybeSingle();
    if (fetchError) {
      console.error(
        "[refreshCompletionFeedPostImage] fetch failed:",
        fetchError.message,
      );
      return { postId: null };
    }
    if (!existing?.id) return { postId: null };

    const imageUrl = buildPublicGeneratedImageUrl(mountStoragePath);
    if (!imageUrl) return { postId: null };

    const { thumbPath, displayPath } = await uploadWebPVariants(
      imageUrl,
      mountStoragePath,
    );

    const { error: updateError } = await adminSupabase
      .from("generated_images")
      .update({
        image_url: imageUrl,
        storage_path: mountStoragePath,
        storage_path_display: displayPath,
        storage_path_thumb: thumbPath,
        // 実寸は Post 詳細の lazy compute で取り直されるためクリアする
        width: null,
        height: null,
      })
      .eq("id", existing.id as string);
    if (updateError) {
      console.error(
        "[refreshCompletionFeedPostImage] update failed:",
        updateError.message,
      );
      return { postId: null };
    }
    return { postId: existing.id as string };
  } catch (e) {
    console.error("[refreshCompletionFeedPostImage] failed:", e);
    return { postId: null };
  }
}
