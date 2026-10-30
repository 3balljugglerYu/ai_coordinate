import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 見本の「使える見本・使えない見本」への同意(catalog_reference_consents)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * - 同意の画面は、見本を初めて選んだときだけ出す。「わかりました」を押した時刻を本人ごとに1行残す
 * - 本人の見本が、同意のあとに作り直しになったら、同意はもう一度要る(同意の画面をもう一度出す)
 * - 書くのも読むのもサーバー(service role)だけ
 */

export type CatalogReferenceConsentState = {
  /** いちばん新しく同意した時刻。同意したことが無ければ null */
  consentedAt: Date | null;
  /** 同意の画面を出す必要があるか(同意が無い・同意のあとに本人の見本が作り直しになった) */
  needsConsent: boolean;
};

function getSupabase(client?: SupabaseClient): SupabaseClient {
  return client ?? createAdminClient();
}

/** 本人の同意の状態。DB のエラーは投げる */
export async function getCatalogReferenceConsentState(
  userId: string,
  client?: SupabaseClient,
): Promise<CatalogReferenceConsentState> {
  const supabase = getSupabase(client);
  const [consent, rejected] = await Promise.all([
    supabase.from("catalog_reference_consents").select("consented_at").eq("user_id", userId).maybeSingle(),
    supabase
      .from("catalog_reference_images")
      .select("rejected_at")
      .eq("user_id", userId)
      .not("rejected_at", "is", null)
      .order("rejected_at", { ascending: false })
      .limit(1),
  ]);
  if (consent.error || rejected.error) {
    console.error(
      "[catalog-references] consent state error:",
      consent.error?.message ?? rejected.error?.message,
    );
    throw new Error("見本の同意の確認に失敗しました");
  }

  const consentRow = consent.data as { consented_at: string } | null;
  const consentedAt = consentRow ? new Date(consentRow.consented_at) : null;
  const latestRejected = ((rejected.data ?? [])[0] as { rejected_at: string } | undefined)?.rejected_at;
  const rejectedAfterConsent =
    consentedAt !== null && latestRejected !== undefined && new Date(latestRejected) > consentedAt;
  return { consentedAt, needsConsent: consentedAt === null || rejectedAfterConsent };
}

/**
 * 同意の画面を出さなくてよいか(/free で、同意の画面と案内を出すかを決める)。
 * DB のエラーは false(同意の画面をもう一度出す。安全なほうに倒す)
 */
export async function hasCatalogReferenceConsent(
  userId: string,
  client?: SupabaseClient,
): Promise<boolean> {
  try {
    return !(await getCatalogReferenceConsentState(userId, client)).needsConsent;
  } catch (e) {
    console.warn("[catalog-references] consent check failed:", e);
    return false;
  }
}

/** 「わかりました」を押した時刻を残す(もう一度同意したら書き換える)。DB のエラーは投げる */
export async function recordCatalogReferenceConsent(
  userId: string,
  client?: SupabaseClient,
): Promise<Date> {
  const { data, error } = await getSupabase(client)
    .from("catalog_reference_consents")
    .upsert({ user_id: userId, consented_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("consented_at")
    .single();
  if (error || !data) {
    console.error("[catalog-references] consent record error:", error?.message);
    throw new Error("見本の同意を残せませんでした");
  }
  return new Date((data as { consented_at: string }).consented_at);
}
