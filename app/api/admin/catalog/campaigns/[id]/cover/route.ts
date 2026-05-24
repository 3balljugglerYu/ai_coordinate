import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  CATALOG_CACHE_TAGS,
  catalogCampaignTag,
} from "@/features/catalog/lib/get-public-catalog";
import { updateCampaign } from "@/features/catalog/lib/admin-repository";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";
import { convertCatalogImageToWebp } from "@/features/catalog/lib/catalog-image";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const CATALOG_BUCKET = "catalog-images";

/**
 * POST /api/admin/catalog/campaigns/[id]/cover
 * 企画のカバー画像を multipart でアップロードし、cover_storage_path を更新する。
 *
 * 旧画像は upsert せず別パスに保存し、孤立ファイルとして残す
 * (storage 課金は許容範囲。後で運用上の cleanup ジョブで掃除する)。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;
  if (!id) {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_ID", 400);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(copy.invalidRequest, "CATALOG_ADMIN_INVALID_REQUEST", 400);
  }

  const file = formData.get("image");
  if (!(file instanceof Blob) || file.size === 0) {
    return jsonError(
      copy.submissionImageMissing,
      "CATALOG_ADMIN_COVER_MISSING",
      400,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError(
      copy.submissionImageTooLarge,
      "CATALOG_ADMIN_COVER_TOO_LARGE",
      400,
    );
  }
  const mimeType = (file as Blob).type || "";
  if (!ACCEPTED_MIME.has(mimeType)) {
    return jsonError(
      copy.submissionImageInvalidFormat,
      "CATALOG_ADMIN_COVER_INVALID_FORMAT",
      400,
    );
  }

  const adminClient = createAdminClient();

  // 対象企画の slug を取得 (cacheTag 失効と監査ログメタに使う)
  const { data: campaign } = await adminClient
    .from("catalog_campaigns")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) {
    return jsonError(
      copy.campaignNotFound,
      "CATALOG_CAMPAIGN_NOT_FOUND",
      404,
    );
  }

  const storagePath = `covers/${campaign.id}/${Date.now()}-${randomUUID()}.webp`;

  // 保存前に WebP へ変換 + リサイズして「常に WebP」で保存する。
  let webpBuffer: Buffer;
  try {
    webpBuffer = await convertCatalogImageToWebp(
      Buffer.from(await file.arrayBuffer()),
    );
  } catch (error) {
    console.error("[admin catalog cover POST] webp conversion failed", error);
    return jsonError(
      copy.submissionImageInvalidFormat,
      "CATALOG_ADMIN_COVER_CONVERT_FAILED",
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
    console.error("[admin catalog cover POST] upload failed", uploadError);
    return jsonError(
      copy.storageUploadFailed,
      "CATALOG_ADMIN_COVER_UPLOAD_FAILED",
      500,
    );
  }

  const { data: updated, error: updateError } = await updateCampaign(
    adminClient,
    id,
    { cover_storage_path: storagePath },
  );
  if (updateError || !updated) {
    console.error(
      "[admin catalog cover POST] update_campaign failed",
      updateError,
    );
    // 失敗時は upload 済みファイルを削除して状態を戻す
    await adminClient.storage.from(CATALOG_BUCKET).remove([storagePath]);
    return jsonError(
      copy.submissionFailed,
      "CATALOG_ADMIN_COVER_UPDATE_FAILED",
      500,
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "catalog_campaign_update",
    targetType: "catalog_campaign",
    targetId: id,
    metadata: { cover_storage_path: storagePath },
  });

  try {
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
    revalidateTag(catalogCampaignTag(updated.slug), "max");
  } catch (err) {
    console.warn("[admin catalog cover POST] revalidate failed", err);
  }

  return NextResponse.json({ campaign: updated });
}

/**
 * DELETE /api/admin/catalog/campaigns/[id]/cover
 * カバー画像参照を解除する (storage のファイル自体は孤立としてそのまま残す)。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;
  const adminClient = createAdminClient();

  const { data: updated, error } = await updateCampaign(adminClient, id, {
    cover_storage_path: null,
  });
  if (error || !updated) {
    return jsonError(
      copy.campaignNotFound,
      "CATALOG_ADMIN_COVER_DELETE_FAILED",
      404,
    );
  }

  await logAdminAction({
    adminUserId: adminUser.id,
    actionType: "catalog_campaign_update",
    targetType: "catalog_campaign",
    targetId: id,
    metadata: { cover_storage_path: null },
  });

  try {
    revalidateTag(CATALOG_CACHE_TAGS.campaigns, "max");
    revalidateTag(catalogCampaignTag(updated.slug), "max");
  } catch (err) {
    console.warn("[admin catalog cover DELETE] revalidate failed", err);
  }

  return NextResponse.json({ campaign: updated });
}
