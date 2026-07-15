import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 指定ユーザーが、指定カテゴリ(企画=collection-series)で既に生成済みの
 * プリセットID集合を返す。/style やホームの「生成済み ✓」判定に使う。
 *
 * image_jobs の成功ジョブから style_template_id(= 生成したプリセットID)を集める。
 * 失敗時・対象カテゴリなしのときは空配列(= すべて未生成扱い)にフォールバックし、
 * 画面全体は壊さない。
 */
export async function getGeneratedCollectionPresetIds(
  userId: string,
  categoryKeys: readonly string[],
): Promise<string[]> {
  if (categoryKeys.length === 0) {
    return [];
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("image_jobs")
      .select("style_template_id")
      .eq("user_id", userId)
      .eq("status", "succeeded")
      .in("style_preset_category_key", categoryKeys as string[])
      .not("style_template_id", "is", null)
      .limit(1000);
    if (error) {
      return [];
    }
    const ids = new Set<string>();
    for (const row of data ?? []) {
      const id = (row as { style_template_id: string | null }).style_template_id;
      if (id) {
        ids.add(id);
      }
    }
    return Array.from(ids);
  } catch {
    return [];
  }
}
