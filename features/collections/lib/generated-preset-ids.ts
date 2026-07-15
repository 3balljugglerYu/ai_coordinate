import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 指定カテゴリ(企画=collection-series)で、呼び出しユーザー本人が既に生成済みの
 * プリセットID集合を返す。/style の「生成済み ✓」判定に使う。
 *
 * DB 側 DISTINCT の RPC get_generated_preset_ids(SECURITY INVOKER, auth.uid())を、
 * セッション認証済みクライアントで呼ぶ。これにより:
 *  - RLS が適用され本人行のみ対象(service_role を使わない)、
 *  - DISTINCT を DB 側で行うため PostgREST の 1000 行上限に依存しない。
 * 失敗時・対象カテゴリなしのときは空配列(= すべて未生成扱い)にフォールバックする。
 *
 * @param client cookie 認証済みサーバークライアント(lib/supabase/server の createClient())
 */
export async function getGeneratedCollectionPresetIds(
  client: SupabaseClient,
  categoryKeys: readonly string[],
): Promise<string[]> {
  if (categoryKeys.length === 0) {
    return [];
  }
  try {
    const { data, error } = await client.rpc("get_generated_preset_ids", {
      p_category_keys: categoryKeys as string[],
    });
    if (error) {
      return [];
    }
    const ids = new Set<string>();
    for (const row of (data ?? []) as Array<{ preset_id: string | null }>) {
      if (row.preset_id) {
        ids.add(row.preset_id);
      }
    }
    return Array.from(ids);
  } catch {
    return [];
  }
}
