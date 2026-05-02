import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInspireFeatureEnabled } from "@/lib/env";
import {
  createStyleTemplateSignedUrl,
  getStyleTemplateById,
} from "@/features/inspire/lib/repository";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";
import { getUser } from "@/lib/auth";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

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

  const adminClient = createAdminClient();
  const { data, error } = await getStyleTemplateById(adminClient, id);

  if (error) {
    console.error("[style-templates GET id] failed", error);
    return jsonError(copy.listFetchFailed, "INSPIRE_FETCH_FAILED", 500);
  }
  if (!data) {
    return jsonError(copy.templateNotFound, "INSPIRE_TEMPLATE_NOT_FOUND", 404);
  }

  // visible のみ匿名/認証者問わず公開。owner と admin は他状態も見えるが、本 API は公開用途なので
  // visible 以外は 404 を返す（owner / admin 用は別 API を用意する）。
  if (data.moderation_status !== "visible") {
    // owner なら自分の draft / pending / removed / withdrawn 行も返してよい
    const user = await getUser();
    if (!user || user.id !== data.submitted_by_user_id) {
      return jsonError(
        copy.templateNotVisible,
        "INSPIRE_TEMPLATE_NOT_VISIBLE",
        404
      );
    }
  }

  let signedUrl: string | null = null;
  if (data.storage_path) {
    const result = await createStyleTemplateSignedUrl(
      adminClient,
      data.storage_path,
      SIGNED_URL_TTL_SECONDS
    );
    signedUrl = result.url;
  }

  return NextResponse.json({
    template: {
      id: data.id,
      submitted_by_user_id: data.submitted_by_user_id,
      alt: data.alt,
      image_url: signedUrl,
      moderation_status: data.moderation_status,
      display_order: data.display_order,
      created_at: data.created_at,
    },
    signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
  });
}
