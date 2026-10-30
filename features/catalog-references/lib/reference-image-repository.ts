import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 見本(参照画像)の保存。計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 3・ADR-002)
 *
 * - 置き場所は非公開のバケット catalog-references/{user_id}/{uuid}.webp(利用者向けの storage ポリシーは無い)
 * - 行は catalog_reference_images。同意した時刻を必ず入れる
 * - 書くのはサーバー(service role)だけ
 */

export const CATALOG_REFERENCE_BUCKET = "catalog-references";

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

/**
 * 作り直し済み(WebP・メタデータ除去済み)の見本を置き、行を作って id を返す。
 * 行を作れなかったら、置いたファイルを消して投げる(見本の行の無いファイルを残さない)。
 */
export async function saveCatalogReferenceImage(
  params: { userId: string; webpBuffer: Buffer; consentedAt: Date },
  client?: SupabaseClient,
): Promise<{ id: string }> {
  const supabase = getSupabase(client);
  const storagePath = `${params.userId}/${randomUUID()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(CATALOG_REFERENCE_BUCKET)
    .upload(storagePath, params.webpBuffer, { contentType: "image/webp", upsert: false });
  if (uploadError) {
    console.error("[catalog-references] upload error:", uploadError.message);
    throw new Error("見本の保存に失敗しました");
  }

  const { data, error } = await supabase
    .from("catalog_reference_images")
    .insert({
      user_id: params.userId,
      storage_path: storagePath,
      copyright_consent_at: params.consentedAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[catalog-references] insert error:", error?.message);
    await supabase.storage.from(CATALOG_REFERENCE_BUCKET).remove([storagePath]);
    throw new Error("見本の保存に失敗しました");
  }

  return { id: (data as { id: string }).id };
}

/** その人の見本で、作り直しになっていないものか(生成の受付で確かめる)。DB のエラーは投げる */
export async function isUsableOwnCatalogReference(
  params: { userId: string; referenceId: string },
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = getSupabase(client);
  const { data, error } = await supabase
    .from("catalog_reference_images")
    .select("id")
    .eq("id", params.referenceId)
    .eq("user_id", params.userId)
    .is("rejected_at", null)
    .maybeSingle();
  if (error) {
    console.error("[catalog-references] usable check error:", error.message);
    throw new Error("見本の確認に失敗しました");
  }
  return data !== null;
}
