import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isInI2iCatalogAllowlist } from "@/lib/auth/i2i-catalog";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { jsonError } from "@/lib/api/json-error";
import { MAX_DIMENSION, processSubmissionImage } from "@/features/inspire/lib/creator-looks-image";
import { SUBMISSION_IMAGE_MIN_DIMENSION } from "@/features/inspire/lib/submission-image-constraints";
import {
  CatalogReferenceConsentRequiredError,
  saveCatalogReferenceImage,
} from "@/features/catalog-references/lib/reference-image-repository";
import { getCatalogReferenceConsentState } from "@/features/catalog-references/lib/consent-repository";

/**
 * 4MB まで。基盤(Vercel)の本文の上限が約4.5MB なので、それより大きいものはここまで届かない。
 * 画面(段階6)では送る前に縮める
 */
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/catalog-references: 見本(参照画像)を1枚上げる(multipart: file)。
 * 計画: docs/planning/i2i-catalog-review-implementation-plan.md(Phase 3・REQ-001・REQ-002・ADR-002)
 *
 * - 見本を使える人(運営が選んだ人)だけ。ほかの人は 403
 * - 「使える見本・使えない見本」への同意が要る。同意は「わかりました」を押したときに本人ごとにサーバーに残す
 *   (POST /api/catalog-references/consent)。有効な同意が無い・同意のあとに本人の見本が作り直しになったときは 400。
 *   見本の行には、その同意の時刻を写す(同意の画面を出していない時刻を、同意の時刻として残さない)。
 *   同意の確認は軽いので、本文を受け取る前に済ませ、通ったときだけ重い画像の作り直しをする。
 *   行を作るときにも DB(トリガー)が有効な同意を確かめて時刻を写すので、その間に作り直しで無効になっても保存しない
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

  let consentedAt: Date | null;
  try {
    consentedAt = (await getCatalogReferenceConsentState(user.id)).consentedAt;
  } catch (error) {
    console.error("[catalog-references] consent check error:", error);
    return jsonError("見本の同意を確かめられませんでした", "CATALOG_REFERENCE_CONSENT_CHECK_FAILED", 500);
  }
  if (consentedAt === null) {
    return jsonError("見本の案内への同意が必要です", "CATALOG_REFERENCE_CONSENT_REQUIRED", 400);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("入力が不正です", "CATALOG_REFERENCE_INVALID_REQUEST", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError("画像を選んでください", "CATALOG_REFERENCE_FILE_REQUIRED", 400);
  }
  if (file.size > MAX_REFERENCE_BYTES) {
    return jsonError("画像は4MBまでです", "CATALOG_REFERENCE_FILE_TOO_LARGE", 413);
  }

  const processed = await processSubmissionImage(Buffer.from(await file.arrayBuffer()));
  if (!processed.ok) {
    if (processed.error.code === "DIMENSION_TOO_SMALL") {
      return jsonError(
        `画像が小さすぎます(縦横とも${SUBMISSION_IMAGE_MIN_DIMENSION}px以上)`,
        "CATALOG_REFERENCE_IMAGE_TOO_SMALL",
        400,
      );
    }
    if (processed.error.code === "DIMENSION_TOO_LARGE") {
      return jsonError(
        `画像が大きすぎます(縦横とも${MAX_DIMENSION}px以下)`,
        "CATALOG_REFERENCE_IMAGE_TOO_LARGE",
        400,
      );
    }
    return jsonError("この画像は使えません(JPEG・PNG・WebP・HEIC)", "CATALOG_REFERENCE_IMAGE_INVALID", 400);
  }

  try {
    const { id } = await saveCatalogReferenceImage({
      userId: user.id,
      webpBuffer: processed.data.webpBuffer,
      consentedAt,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogReferenceConsentRequiredError) {
      return jsonError("見本の案内への同意が必要です", "CATALOG_REFERENCE_CONSENT_REQUIRED", 400);
    }
    console.error("[catalog-references] POST error:", error);
    return jsonError("見本の保存に失敗しました", "CATALOG_REFERENCE_SAVE_FAILED", 500);
  }
}
