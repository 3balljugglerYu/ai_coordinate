import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { jsonError } from "@/lib/api/json-error";
import { processSubmissionImage } from "@/features/inspire/lib/creator-looks-image";
import { saveCatalogReferenceImage } from "@/features/catalog-references/lib/reference-image-repository";

/** バケットの上限と同じ(10MB) */
const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/catalog-references: 見本(参照画像)を1枚上げる(multipart: file・copyrightConsent=true)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 3・REQ-001・REQ-002・ADR-002)
 *
 * - 見本を使える人(運営が選んだ人)だけ。ほかの人は 403
 * - 「使える見本・使えない見本」の案内への同意が要る
 * - 画像は中身で形式を確かめ、WebP に作り直して(位置情報などを消して)非公開の置き場所に置く
 * - 返すのは見本の id だけ(生成の依頼には id を渡す)。場所は返さない
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("入力が不正です", "CATALOG_REFERENCE_INVALID_REQUEST", 400);
  }

  if (form.get("copyrightConsent") !== "true") {
    return jsonError("見本の案内への同意が必要です", "CATALOG_REFERENCE_CONSENT_REQUIRED", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("画像を選んでください", "CATALOG_REFERENCE_FILE_REQUIRED", 400);
  }
  if (file.size > MAX_REFERENCE_BYTES) {
    return jsonError("画像は10MBまでです", "CATALOG_REFERENCE_FILE_TOO_LARGE", 413);
  }

  const processed = await processSubmissionImage(Buffer.from(await file.arrayBuffer()));
  if (!processed.ok) {
    const tooSmall = processed.error.code === "DIMENSION_TOO_SMALL";
    return jsonError(
      tooSmall ? "画像が小さすぎます(縦横とも768px以上)" : "この画像は使えません(JPEG・PNG・WebP・HEIC)",
      tooSmall ? "CATALOG_REFERENCE_IMAGE_TOO_SMALL" : "CATALOG_REFERENCE_IMAGE_INVALID",
      400,
    );
  }

  try {
    const { id } = await saveCatalogReferenceImage({
      userId: user.id,
      webpBuffer: processed.data.webpBuffer,
      consentedAt: new Date(),
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("[catalog-references] POST error:", error);
    return jsonError("見本の保存に失敗しました", "CATALOG_REFERENCE_SAVE_FAILED", 500);
  }
}
