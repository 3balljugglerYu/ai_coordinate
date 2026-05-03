import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInspireFeatureEnabled } from "@/lib/env";
import {
  createStyleTemplateSignedUrls,
  getStyleTemplateById,
} from "@/features/inspire/lib/repository";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";
import { getUser } from "@/lib/auth";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * GET /api/style-templates/[id]?include_previews=1
 *
 * 公開用途では visible のみ返す。owner なら自分の全状態の行も取得可。
 * ?include_previews=1 のときは owner（または admin）にのみ preview の signed URL も返す
 * （申請ダイアログの Step 3 表示で利用、レビュー指摘 #8）。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  if (!isInspireFeatureEnabled()) {
    return jsonError(copy.notConfigured, "INSPIRE_DISABLED", 404);
  }

  const { id } = await params;
  if (!id) {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_ID", 400);
  }

  const url = new URL(request.url);
  const includePreviews = url.searchParams.get("include_previews") === "1";

  const adminClient = createAdminClient();
  const { data, error } = await getStyleTemplateById(adminClient, id);

  if (error) {
    console.error("[style-templates GET id] failed", error);
    return jsonError(copy.listFetchFailed, "INSPIRE_FETCH_FAILED", 500);
  }
  if (!data) {
    return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
  }

  // owner 判定（preview 表示と非 visible アクセスの両方で必要）
  const user = await getUser();
  const isOwner = user !== null && user.id === data.submitted_by_user_id;

  // visible 以外は owner のみ閲覧可
  if (data.moderation_status !== "visible" && !isOwner) {
    return jsonError(
      copy.templateNotVisible,
      "INSPIRE_TEMPLATE_NOT_VISIBLE",
      404
    );
  }

  // include_previews は owner のみ許可（preview 画像は外部に出さない）
  const shouldIncludePreviews = includePreviews && isOwner;

  // signed URL を一括発行
  const paths = [
    data.storage_path,
    shouldIncludePreviews ? data.preview_openai_image_url : null,
    shouldIncludePreviews ? data.preview_gemini_image_url : null,
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  const { urls } = await createStyleTemplateSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));
  const sign = (path: string | null) =>
    path ? pathToUrl.get(path) ?? null : null;

  return NextResponse.json({
    template: {
      id: data.id,
      submitted_by_user_id: data.submitted_by_user_id,
      alt: data.alt,
      image_url: sign(data.storage_path),
      moderation_status: data.moderation_status,
      display_order: data.display_order,
      created_at: data.created_at,
      ...(shouldIncludePreviews
        ? {
            preview_openai_image_url: sign(data.preview_openai_image_url),
            preview_gemini_image_url: sign(data.preview_gemini_image_url),
          }
        : {}),
    },
    signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
  });
}
