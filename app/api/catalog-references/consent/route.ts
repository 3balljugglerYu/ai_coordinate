import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { jsonError } from "@/lib/api/json-error";
import { recordCatalogReferenceConsent } from "@/features/catalog-references/lib/consent-repository";

/**
 * POST /api/catalog-references/consent: 「使える見本・使えない見本」で「わかりました」を押したことを残す。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md §10
 *
 * - 見本を使える人(運営が選んだ人)だけ。ほかの人は 403
 * - 本人ごとに、押した時刻を1行残す(もう一度押したら書き換える)。見本を上げる API は、この同意があるときだけ受け付ける
 */
export async function POST(request: NextRequest) {
  const originReject = ensureSameOrigin(request);
  if (originReject) return originReject;

  const user = await getUser();
  if (!user) {
    return jsonError("ログインが必要です", "CATALOG_REFERENCE_AUTH_REQUIRED", 401);
  }
  if (!(await isInI2iCatalogAllowlist(user.id))) {
    return jsonError("見本を使える人ではありません", "CATALOG_REFERENCE_NOT_ALLOWED", 403);
  }

  try {
    const consentedAt = await recordCatalogReferenceConsent(user.id);
    return NextResponse.json({ consentedAt: consentedAt.toISOString() });
  } catch (error) {
    console.error("[catalog-references] consent POST error:", error);
    return jsonError("同意を残せませんでした", "CATALOG_REFERENCE_CONSENT_SAVE_FAILED", 500);
  }
}
