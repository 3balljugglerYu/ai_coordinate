import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCatalogFeatureEnabled } from "@/lib/env";
import {
  CATALOG_CACHE_TAGS,
  catalogCampaignTag,
} from "@/features/catalog/lib/get-public-catalog";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { convertCatalogImageToWebp } from "@/features/catalog/lib/catalog-image";
import { verifyTurnstileToken } from "@/features/catalog/lib/turnstile";
import {
  parseTweetUrl,
  parseXAccountUrl,
} from "@/features/catalog/lib/tweet-url";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";
import { getUser } from "@/lib/auth";

const SUBMITTER_TOKEN_COOKIE = "catalog_submitter_token";
const SUBMITTER_TOKEN_MAX_AGE = 60 * 60 * 24 * 365; // 1 年
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const CATALOG_BUCKET = "catalog-images";

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  const candidate =
    firstForwardedIp ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null;

  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

/**
 * POST /api/catalog/submissions
 *
 * 絵師カタログへのゲスト/会員投稿を受け付ける。
 *
 * 主要なフロー (ADR-002, ADR-004, ADR-007, ADR-008):
 * 1. multipart の解析 (画像 File + メタデータ)
 * 2. Turnstile トークンをサーバ側で検証
 * 3. 入力検証 (slug, X URL, tweet URL, MIME, サイズ)
 * 4. 同 tweet URL の重複 (approved) チェック
 * 5. service-role で catalog-images バケットにアップロード
 * 6. catalog_entries に INSERT (cap trigger と一意制約で重複・上限を最終防衛)
 * 7. submitter_token cookie を Set-Cookie で返す (HttpOnly / SameSite=Lax)
 */
export async function POST(request: NextRequest) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));

  if (!isCatalogFeatureEnabled()) {
    return jsonError(copy.invalidRequest, "CATALOG_FEATURE_DISABLED", 404);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(copy.invalidRequest, "CATALOG_INVALID_FORM", 400);
  }

  const slug = String(formData.get("campaign_slug") ?? "").trim();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const xAccountUrlRaw = String(formData.get("x_account_url") ?? "").trim();
  const sourceTweetUrlRaw = String(formData.get("source_tweet_url") ?? "")
    .trim();
  const altRaw = String(formData.get("alt") ?? "").trim();
  const submitterEmailRaw = String(formData.get("submitter_email") ?? "")
    .trim();
  const consent = String(formData.get("copyright_consent") ?? "") === "true";
  const turnstileToken = String(formData.get("turnstile_token") ?? "").trim();
  const image = formData.get("image");

  if (slug === "" || displayName === "") {
    return jsonError(copy.submissionInvalid, "CATALOG_INVALID_INPUT", 400);
  }
  if (displayName.length > 64) {
    return jsonError(copy.submissionInvalid, "CATALOG_INVALID_INPUT", 400);
  }
  if (!consent) {
    return jsonError(
      copy.submissionConsentRequired,
      "CATALOG_CONSENT_REQUIRED",
      400,
    );
  }

  const xAccount = parseXAccountUrl(xAccountUrlRaw);
  if (!xAccount) {
    return jsonError(
      copy.submissionXAccountInvalid,
      "CATALOG_X_ACCOUNT_INVALID",
      400,
    );
  }
  const sourceTweet = parseTweetUrl(sourceTweetUrlRaw);
  if (!sourceTweet) {
    return jsonError(
      copy.submissionTweetInvalid,
      "CATALOG_TWEET_INVALID",
      400,
    );
  }

  if (!(image instanceof Blob) || image.size === 0) {
    return jsonError(
      copy.submissionImageMissing,
      "CATALOG_IMAGE_MISSING",
      400,
    );
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return jsonError(
      copy.submissionImageTooLarge,
      "CATALOG_IMAGE_TOO_LARGE",
      400,
    );
  }
  const imageType = (image as Blob).type || "";
  if (!ACCEPTED_MIME.has(imageType)) {
    return jsonError(
      copy.submissionImageInvalidFormat,
      "CATALOG_IMAGE_INVALID_FORMAT",
      400,
    );
  }

  // Turnstile 検証 (本番は必須、開発で secret 未設定なら通す)
  const turnstileResult = await verifyTurnstileToken(
    turnstileToken,
    getClientIp(request),
  );
  if (
    !turnstileResult.success &&
    turnstileResult.reason !== "missing_secret"
  ) {
    return jsonError(
      copy.submissionTurnstileFailed,
      "CATALOG_TURNSTILE_FAILED",
      400,
    );
  }

  const adminClient = createAdminClient();

  // campaign が published か確認
  const { data: campaign } = await adminClient
    .from("catalog_campaigns")
    .select("id, slug, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!campaign || campaign.status !== "published") {
    return jsonError(
      copy.campaignNotPublished,
      "CATALOG_CAMPAIGN_NOT_PUBLISHED",
      400,
    );
  }

  // 重複: 同じ tweet ID が審査待ち / 公開中なら拒否
  const { data: duplicate } = await adminClient
    .from("catalog_entries")
    .select("id")
    .eq("source_tweet_status_id", sourceTweet.statusId)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (duplicate) {
    return jsonError(
      copy.submissionTweetDuplicate,
      "CATALOG_TWEET_DUPLICATE",
      409,
    );
  }

  // 投稿者トークン (Cookie)
  const existingToken =
    request.cookies.get(SUBMITTER_TOKEN_COOKIE)?.value ?? null;
  const submitterToken =
    existingToken && existingToken.length === 36 ? existingToken : randomUUID();

  // 会員ログイン中なら user_id を記録
  const user = await getUser().catch(() => null);
  const submitterUserId = user?.id ?? null;

  // Storage upload。保存前に WebP へ変換 + リサイズして「常に WebP」で保存する。
  const folder = submitterUserId ?? `guest/${submitterToken}`;
  const storagePath = `${folder}/${Date.now()}-${randomUUID()}.webp`;

  let webpBuffer: Buffer;
  try {
    webpBuffer = await convertCatalogImageToWebp(
      Buffer.from(await image.arrayBuffer()),
    );
  } catch (error) {
    console.error("[catalog submissions] webp conversion failed", error);
    return jsonError(
      copy.submissionImageInvalidFormat,
      "CATALOG_IMAGE_CONVERT_FAILED",
      400,
    );
  }
  const { error: uploadError } = await adminClient.storage
    .from(CATALOG_BUCKET)
    .upload(storagePath, webpBuffer, {
      contentType: "image/webp",
      upsert: false,
    });
  if (uploadError) {
    console.error("[catalog submissions] upload failed", uploadError);
    return jsonError(
      copy.storageUploadFailed,
      "CATALOG_STORAGE_UPLOAD_FAILED",
      500,
    );
  }

  // INSERT (id を取得して監査ログにも記録する)
  const { data: insertedRow, error: insertError } = await adminClient
    .from("catalog_entries")
    .insert({
      campaign_id: campaign.id,
      submitter_user_id: submitterUserId,
      submitter_token: submitterToken,
      display_name: displayName,
      x_account_url: xAccount.normalized,
      source_tweet_url: sourceTweet.normalized,
      source_tweet_status_id: sourceTweet.statusId,
      image_storage_path: storagePath,
      alt: altRaw.length > 0 ? altRaw : null,
      submitter_email: submitterEmailRaw || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[catalog submissions] insert failed", insertError);
    // 上限超過のトリガ例外を判別
    const message = insertError.message ?? "";
    if (message.includes("catalog_entry_submission_cap_exceeded")) {
      return jsonError(
        copy.submissionCapExceeded,
        "CATALOG_SUBMISSION_CAP_EXCEEDED",
        429,
      );
    }
    if (
      insertError.code === "23505" &&
      message.includes("uniq_catalog_entries_active_source_tweet_status")
    ) {
      return jsonError(
        copy.submissionTweetDuplicate,
        "CATALOG_TWEET_DUPLICATE",
        409,
      );
    }
    // unique 制約は upload 後の race のみ
    return jsonError(
      copy.submissionFailed,
      "CATALOG_SUBMISSION_FAILED",
      500,
    );
  }

  // audit log
  if (insertedRow?.id) {
    await adminClient.from("catalog_audit_logs").insert({
      entry_id: insertedRow.id,
      actor_id: submitterUserId,
      action: "submit",
      reason: null,
      metadata: {
        campaign_slug: campaign.slug,
        x_handle: xAccount.handle,
        tweet_status_id: sourceTweet.statusId,
      },
    });
  }

  // キャッシュ失効
  try {
    revalidateTag(catalogCampaignTag(campaign.slug), "max");
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
  } catch (err) {
    console.warn("[catalog submissions] revalidate failed", err);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SUBMITTER_TOKEN_COOKIE,
    value: submitterToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SUBMITTER_TOKEN_MAX_AGE,
    path: "/",
  });
  return response;
}
