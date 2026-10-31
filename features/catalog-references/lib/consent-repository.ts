import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 見本の「使える見本・使えない見本」への同意(catalog_reference_consents)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * - 同意の画面は、有効な同意が無い人にだけ出す。「わかりました」を押した時刻を本人ごとに1行残す(時刻は DB の now())
 * - 本人の見本が作り直しになったら、DB のトリガーが同じトランザクションで同意を無効にする(revoked_at)。
 *   無効の間は同意がもう一度要る。もう一度同意すると無効の印が外れる
 * - 書くのも読むのもサーバー(service role)だけ
 */

export type CatalogReferenceConsentState = {
  /** 有効な同意の時刻。同意が無い・無効になっているときは null */
  consentedAt: Date | null;
  /** 一度でも同意したことがあるか(「先行公開」の案内や「次からは出ません」を出すかに使う) */
  consentedBefore: boolean;
};

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

/** 本人の同意の状態。DB のエラーは投げる */
export async function getCatalogReferenceConsentState(
  userId: string,
  client?: SupabaseClient,
): Promise<CatalogReferenceConsentState> {
  const { data, error } = await getSupabase(client)
    .from("catalog_reference_consents")
    .select("consented_at, revoked_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[catalog-references] consent state error:", error.message);
    throw new Error("見本の同意の確認に失敗しました");
  }
  const row = data as { consented_at: string; revoked_at: string | null } | null;
  return {
    consentedAt: row && row.revoked_at === null ? new Date(row.consented_at) : null,
    consentedBefore: row !== null,
  };
}

/**
 * /free で、同意の画面と案内を出すかを決めるための値。
 * DB のエラーは「同意なし・初めて」として扱う(同意の画面をもう一度出す。安全なほうに倒す)
 */
export async function getCatalogReferenceConsentSummary(
  userId: string,
  client?: SupabaseClient,
): Promise<{ consented: boolean; consentedBefore: boolean }> {
  try {
    const state = await getCatalogReferenceConsentState(userId, client);
    return { consented: state.consentedAt !== null, consentedBefore: state.consentedBefore };
  } catch (e) {
    console.warn("[catalog-references] consent check failed:", e);
    return { consented: false, consentedBefore: false };
  }
}

/** 「わかりました」を押したことを残す(もう一度押したら時刻を書き換え、無効の印を外す)。DB のエラーは投げる */
export async function recordCatalogReferenceConsent(
  userId: string,
  client?: SupabaseClient,
): Promise<Date> {
  const { data, error } = await getSupabase(client).rpc("record_catalog_reference_consent", {
    p_user_id: userId,
  });
  if (error || typeof data !== "string") {
    console.error("[catalog-references] consent record error:", error?.message ?? "no time returned");
    throw new Error("見本の同意を残せませんでした");
  }
  return new Date(data);
}
