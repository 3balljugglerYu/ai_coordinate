import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPublicGeneratedImageUrl } from "./public-mount-server-api";
import { getRepresentativeImagesForCategory } from "./representative-images";
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
  return attachCharacterImages(rows.map(mapProgressRow));
}

/**
 * 指定ユーザーの進捗を service_role 専用 RPC で取得する。
 * `includeAdminOnly=true` で admin_only シリーズも含める(admin プレビュー用)。
 * 呼び出し側(server route)で admin 判定し、userId はセッションから解決すること。
 */
export async function getCollectionProgressForUser(
  userId: string,
  includeAdminOnly: boolean,
): Promise<CollectionProgress[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_collection_progress_for_user", {
    p_user_id: userId,
    p_include_admin_only: includeAdminOnly,
  });
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as CollectionProgressRow[];
  const withCharacter = await attachCharacterImages(rows.map(mapProgressRow));
  return attachCollectedImages(withCharacter, userId);
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
    characterImageUrl: null,
    collectedImageUrls: [],
  };
}

/**
 * 各シリーズに「集めたシール画像(衣装ごと最新1枚)」の公開URL配列を付与する。
 * モーダルのシール一覧(GET! / ?)で使う。最大 completionThreshold 件。
 */
async function attachCollectedImages(
  items: CollectionProgress[],
  userId: string,
): Promise<CollectionProgress[]> {
  if (items.length === 0) return items;
  return Promise.all(
    items.map(async (item) => {
      try {
        const reps = await getRepresentativeImagesForCategory({
          userId,
          categoryId: item.categoryId,
          limit: item.completionThreshold,
        });
        return { ...item, collectedImageUrls: reps.map((r) => r.imageUrl) };
      } catch {
        // 画像取得失敗は致命ではない(空配列にフォールバック)
        return item;
      }
    }),
  );
}

/**
 * 各シリーズに「リング中央キャラ画像」の公開URLを付与する。
 * RPC は返さないため、対象カテゴリの collection_character_path をまとめて引いて結合する。
 */
async function attachCharacterImages(
  items: CollectionProgress[],
): Promise<CollectionProgress[]> {
  if (items.length === 0) return items;
  const supabase = createAdminClient();
  const categoryIds = items.map((i) => i.categoryId);
  const { data, error } = await supabase
    .from("preset_categories")
    .select("id, collection_character_path")
    .in("id", categoryIds);
  if (error) {
    // キャラ画像の付与失敗は致命ではない(リングはテキスト表示にフォールバック)
    return items;
  }
  const pathById = new Map<string, string | null>();
  for (const row of data ?? []) {
    pathById.set(
      row.id as string,
      (row.collection_character_path as string | null) ?? null,
    );
  }
  return items.map((i) => ({
    ...i,
    characterImageUrl: buildPublicGeneratedImageUrl(
      pathById.get(i.categoryId) ?? null,
    ),
  }));
}
