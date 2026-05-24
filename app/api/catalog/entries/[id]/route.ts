import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedPublicEntryById } from "@/features/catalog/lib/get-public-catalog";
import { createCatalogSignedUrl } from "@/features/catalog/lib/repository";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";

const SIGNED_URL_TTL_SECONDS = 60 * 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/catalog/entries/[id]
 * 個別ページ (entry) の詳細。共有 URL から OG 情報を組む際にも使う。
 *
 * 親 campaign が published かつ entry が approved な場合のみ返す
 * (catalog_public_entries view が保証する条件を再確認)。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  const { id } = await params;

  if (!UUID_PATTERN.test(id)) {
    return jsonError(copy.invalidRequest, "CATALOG_ENTRY_INVALID_ID", 400);
  }

  try {
    const entry = await getCachedPublicEntryById(id);

    if (entry == null) {
      return jsonError(copy.entryNotFound, "CATALOG_ENTRY_NOT_FOUND", 404);
    }

    const adminClient = createAdminClient();
    const { url: imageUrl } = await createCatalogSignedUrl(
      adminClient,
      entry.image_storage_path,
      SIGNED_URL_TTL_SECONDS,
    );

    // 親 campaign の slug を取得 (共有 URL 構築に使えるよう同梱)
    // view の WHERE 条件で campaign が published であることは保証されている。
    const { data: campaign } = await getPublishedCampaignBySlugByCampaignId(
      entry.campaign_id,
    );

    return NextResponse.json({
      entry: {
        id: entry.id,
        campaign_id: entry.campaign_id,
        campaign_slug: campaign?.slug ?? null,
        display_name: entry.display_name,
        x_account_url: entry.x_account_url,
        source_tweet_url: entry.source_tweet_url,
        image_url: imageUrl,
        alt: entry.alt,
        display_order: entry.display_order,
        approved_at: entry.approved_at,
      },
      signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error("[catalog GET entry] failed", error);
    return jsonError(copy.entriesFetchFailed, "CATALOG_ENTRY_FETCH_FAILED", 500);
  }
}

/**
 * 親 campaign を id 経由で引く小さなヘルパ。
 * view 経由で取得した entry の campaign_id から slug を逆引きするのに使う。
 */
async function getPublishedCampaignBySlugByCampaignId(
  campaignId: string,
): Promise<{ data: { slug: string } | null }> {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("catalog_campaigns")
    .select("slug")
    .eq("id", campaignId)
    .eq("status", "published")
    .maybeSingle();
  return { data: (data as { slug: string } | null) ?? null };
}

