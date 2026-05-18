import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedPublishedCampaigns,
} from "@/features/catalog/lib/get-public-catalog";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * GET /api/catalog/campaigns
 * 公開中の企画一覧 (表紙画像の signed URL 付き)。
 *
 * cached helper でメタデータを取得し、Route Handler 本体で signed URL を発行する。
 * 詳細は ADR-005 参照。
 */
export async function GET(request: NextRequest) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));

  try {
    const campaigns = await getCachedPublishedCampaigns();

    const adminClient = createAdminClient();
    const coverPaths = campaigns
      .map((c) => c.cover_storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    const { urls } = await createCatalogSignedUrls(
      adminClient,
      coverPaths,
      SIGNED_URL_TTL_SECONDS,
    );
    const pathToUrl = new Map<string, string | null>();
    coverPaths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

    const items = campaigns.map((campaign) => ({
      id: campaign.id,
      slug: campaign.slug,
      title: campaign.title,
      description: campaign.description,
      theme_hashtag: campaign.theme_hashtag,
      start_at: campaign.start_at,
      end_at: campaign.end_at,
      display_order: campaign.display_order,
      cover_image_url:
        campaign.cover_storage_path != null
          ? pathToUrl.get(campaign.cover_storage_path) ?? null
          : null,
      created_at: campaign.created_at,
      updated_at: campaign.updated_at,
    }));

    return NextResponse.json({
      items,
      signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error("[catalog GET campaigns] failed", error);
    return jsonError(copy.listFetchFailed, "CATALOG_LIST_FAILED", 500);
  }
}
