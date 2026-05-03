import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInspireFeatureEnabled } from "@/lib/env";
import {
  createStyleTemplateSignedUrls,
  listVisibleStyleTemplates,
} from "@/features/inspire/lib/repository";
import { getInspireRouteCopy } from "@/features/inspire/lib/route-copy";
import { getRouteLocale } from "@/lib/api/route-locale";
import { jsonError } from "@/lib/api/json-error";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

export async function GET(request: NextRequest) {
  const copy = getInspireRouteCopy(getRouteLocale(request));

  if (!isInspireFeatureEnabled()) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const adminClient = createAdminClient();
  const { data, error } = await listVisibleStyleTemplates(adminClient, {
    limit: 50,
  });

  if (error) {
    console.error("[style-templates GET] list failed", error);
    return jsonError(copy.listFetchFailed, "INSPIRE_LIST_FAILED", 500);
  }

  const rows = data ?? [];

  // signed URL を一括発行（レビュー指摘 #5: 行ごと発行から batch へ）
  const paths = rows
    .map((row) => row.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  const { urls } = await createStyleTemplateSignedUrls(
    adminClient,
    paths,
    SIGNED_URL_TTL_SECONDS
  );
  const pathToUrl = new Map<string, string | null>();
  paths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

  const items = rows.map((row) => ({
    id: row.id,
    submitted_by_user_id: row.submitted_by_user_id,
    alt: row.alt,
    image_url: row.storage_path ? pathToUrl.get(row.storage_path) ?? null : null,
    display_order: row.display_order,
    created_at: row.created_at,
  }));

  return NextResponse.json({ items, signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS });
}
