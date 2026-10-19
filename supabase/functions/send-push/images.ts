// 通知に添える画像の URL を DB から探す(index.ts の store から呼ぶ)。
// Deno と Jest の両方で読めるよう、supabase-js には型でも依存しない。
import {
  type PushImageRow,
  type PushImageSource,
  pushImageUrlFromRow,
  usableImageUrl,
} from "./messages.ts";

type QueryResult = { data: unknown; error: { message: string } | null };

/** 使う分だけの PostgREST のクエリビルダー */
export interface ImageQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<QueryResult>;
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): PromiseLike<QueryResult>;
        };
      };
    };
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

  if (source.kind === "generation") {
    // 生成の完了は本人だけに届く、まだ投稿していない画像なので、公開中かは見ない
    const { data, error } = await client
      .from("generated_images")
      .select(IMAGE_COLUMNS)
      .eq("image_job_id", source.imageJobId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(`generation image: ${error.message}`);
    return pushImageUrlFromRow(supabaseUrl, (data as PushImageRow[] | null)?.[0], {
      requireVisible: false,
    });
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
  return pushImageUrlFromRow(supabaseUrl, data as PushImageRow | null, {
    requireVisible: true,
  });
}
