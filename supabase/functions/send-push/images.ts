// 通知に添える画像の URL を DB から探す(index.ts の store から呼ぶ)。
// Deno と Jest の両方で読めるよう、supabase-js には型でも依存しない。
import {
  ownGeneratedImageUrlFromRow,
  type PushImageRow,
  type PushImageSource,
  pushImageUrlFromRow,
  usableImageUrl,
} from "./messages.ts";

type QueryResult = { data: unknown; error: { message: string } | null };

/** 条件を重ねて 1 行を取る部分 */
export interface ImageQueryFilter {
  eq(column: string, value: string | number): ImageQueryFilter;
  maybeSingle(): PromiseLike<QueryResult>;
}

/** 使う分だけの PostgREST のクエリビルダー */
export interface ImageQueryClient {
  from(table: string): {
    select(columns: string): ImageQueryFilter;
  };
}

const IMAGE_COLUMNS =
  "storage_path_thumb, storage_path_display, is_posted, moderation_status";

/**
 * 失敗は投げる(process.ts の resolveImageUrl が記録して、文字だけで送る)。
 * 投稿の画像は公開中のときだけ・小さい版だけ(pushImageUrlFromRow)。
 */
export async function lookupPushImageUrl(
  client: ImageQueryClient,
  supabaseUrl: string,
  source: PushImageSource,
): Promise<string | null> {
  if (source.kind === "avatar") {
    const { data, error } = await client
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", source.userId)
      .maybeSingle();
    if (error) throw new Error(`avatar: ${error.message}`);
    return usableImageUrl((data as { avatar_url?: string | null } | null)?.avatar_url);
  }

  if (source.kind === "generated") {
    // 1 回の生成は 1 枚(#519 で複数枚を廃止)。昔の複数枚のジョブでも 1 枚目だけを見る
    const { data, error } = await client
      .from("generated_images")
      .select(`${IMAGE_COLUMNS}, user_id`)
      .eq("image_job_id", source.imageJobId)
      .eq("image_job_result_index", 0)
      .maybeSingle();
    if (error) throw new Error(`generated image: ${error.message}`);
    return ownGeneratedImageUrlFromRow(supabaseUrl, data as PushImageRow | null, source.userId);
  }

  let postId = source.kind === "post" ? source.postId : null;
  if (source.kind === "comment") {
    const { data, error } = await client
      .from("comments")
      .select("image_id")
      .eq("id", source.commentId)
      .maybeSingle();
    if (error) throw new Error(`comment: ${error.message}`);
    postId = (data as { image_id?: string | null } | null)?.image_id ?? null;
  }
  if (!postId) return null;

  const { data, error } = await client
    .from("generated_images")
    .select(IMAGE_COLUMNS)
    .eq("id", postId)
    .maybeSingle();
  if (error) throw new Error(`post image: ${error.message}`);
  return pushImageUrlFromRow(supabaseUrl, data as PushImageRow | null);
}
