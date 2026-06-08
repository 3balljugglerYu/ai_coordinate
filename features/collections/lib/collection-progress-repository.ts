import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CollectionProgress,
  CollectionProgressRow,
} from "./collection-types";

/**
 * get_collection_progress RPC を呼び、ログインユーザーのコレクション進捗を返す。
 *
 * RPC は user_id を引数で受け取らず auth.uid() を使うため、必ず「認証済み」
 * サーバークライアント(lib/supabase/server.ts の createClient())を渡すこと。
 * service role クライアントを渡すと auth.uid() が null になり空配列になる。
 */
export async function getCollectionProgress(
  supabase: SupabaseClient,
): Promise<CollectionProgress[]> {
  const { data, error } = await supabase.rpc("get_collection_progress");
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as CollectionProgressRow[];
  return rows.map(mapProgressRow);
}

function mapProgressRow(row: CollectionProgressRow): CollectionProgress {
  return {
    categoryId: row.category_id,
    categoryKey: row.category_key,
    displayNameJa: row.display_name_ja,
    displayNameEn: row.display_name_en,
    completionThreshold: row.completion_threshold,
    uniqueOutfitCount: row.unique_outfit_count,
    isCompleted: row.is_completed,
    mountStatus: row.mount_status,
    mountImagePath: row.mount_image_path,
    completedAt: row.completed_at,
  };
}
