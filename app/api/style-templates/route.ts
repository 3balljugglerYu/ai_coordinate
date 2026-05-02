import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInspireFeatureEnabled } from "@/lib/env";
import {
  createStyleTemplateSignedUrl,
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

  // 公開行のみ signed URL を発行して返す
  const items = await Promise.all(
    rows.map(async (row) => {
      let signedUrl: string | null = null;
      if (row.storage_path) {
        const result = await createStyleTemplateSignedUrl(
          adminClient,
          row.storage_path,
          SIGNED_URL_TTL_SECONDS
        );
        signedUrl = result.url;
      }
      return {
        id: row.id,
        submitted_by_user_id: row.submitted_by_user_id,
        alt: row.alt,
        image_url: signedUrl,
        display_order: row.display_order,
        created_at: row.created_at,
      };
    })
  );

  return NextResponse.json({ items, signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS });
}
