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
