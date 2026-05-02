import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStyleTemplateSignedUrl,
  listStyleTemplatesByStatus,
  type StyleTemplateModerationStatus,
} from "@/features/inspire/lib/repository";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const SIGNED_URL_TTL_SECONDS = 60 * 30;
const ALLOWED_STATUSES: StyleTemplateModerationStatus[] = [
  "draft",
  "pending",
  "visible",
  "removed",
  "withdrawn",
];

/**
 * GET /api/admin/style-templates?status=pending&limit=50&offset=0
 *
 * 管理者用一覧。status クエリで絞り込み（pending / visible / removed / draft / withdrawn）。
 * テンプレ画像とプレビュー画像はすべて signed URL に変換して返す。
 */
export async function GET(request: NextRequest) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "pending";
  if (!ALLOWED_STATUSES.includes(statusParam as StyleTemplateModerationStatus)) {
    return jsonError(copy.invalidRequest, "INSPIRE_INVALID_STATUS", 400);
  }
  const status = statusParam as StyleTemplateModerationStatus;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const adminClient = createAdminClient();
  const { data, error } = await listStyleTemplatesByStatus(
    adminClient,
    status,
    {
      limit,
      offset,
    }
  );

  if (error) {
    console.error("[admin style-templates GET] failed", error);
    return jsonError(copy.listFetchFailed, "INSPIRE_ADMIN_LIST_FAILED", 500);
  }

  const rows = data ?? [];
  const items = await Promise.all(
    rows.map(async (row) => {
      const sign = async (path: string | null) => {
        if (!path) return null;
        const { url } = await createStyleTemplateSignedUrl(
          adminClient,
          path,
          SIGNED_URL_TTL_SECONDS
        );
        return url;
      };
      return {
        id: row.id,
        submitted_by_user_id: row.submitted_by_user_id,
        alt: row.alt,
        moderation_status: row.moderation_status,
        moderation_reason: row.moderation_reason,
        moderation_updated_at: row.moderation_updated_at,
        moderation_approved_at: row.moderation_approved_at,
        moderation_decided_by: row.moderation_decided_by,
        copyright_consent_at: row.copyright_consent_at,
        display_order: row.display_order,
        created_at: row.created_at,
        image_url: await sign(row.storage_path),
        preview_openai_image_url: await sign(row.preview_openai_image_url),
        preview_gemini_image_url: await sign(row.preview_gemini_image_url),
      };
    })
  );

  return NextResponse.json({
    items,
    status,
    limit,
    offset,
    signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
  });
}
