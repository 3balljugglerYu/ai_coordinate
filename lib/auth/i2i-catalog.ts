/**
 * 見本(参照画像)つきのカタログを作れる人か(i2i_catalog_allowlist)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md Phase 2・ADR-001
 *
 * - 運営が足した人で、有効(is_active=true)なら true。決まりは DB の関数 is_in_i2i_catalog_allowlist に置く
 *   (生成の worker も同じ関数で確かめる)
 * - DB のエラーや答えが真偽値でないときは false(fail-closed。意図せず開かないように)
 * - 運営も一覧に足して使う(運営だからといって自動では開かない)
 * - server-only(service role で呼ぶ)
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function isInI2iCatalogAllowlist(userId: string | null | undefined): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const { data, error } = await createAdminClient().rpc("is_in_i2i_catalog_allowlist", {
      p_user_id: userId,
    });
    if (error) {
      console.warn("[i2i-catalog] allowlist check failed:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn("[i2i-catalog] allowlist check threw:", e);
    return false;
  }
}
