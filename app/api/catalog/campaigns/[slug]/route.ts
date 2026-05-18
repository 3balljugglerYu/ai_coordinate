import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCachedCampaignBySlug,
  getCachedPublicEntriesByCampaign,
} from "@/features/catalog/lib/get-public-catalog";
import { createCatalogSignedUrls } from "@/features/catalog/lib/repository";
import { getCatalogRouteCopy } from "@/features/catalog/lib/route-copy";

const SIGNED_URL_TTL_SECONDS = 60 * 30;

/**
 * GET /api/catalog/campaigns/[slug]
 * 個別企画の詳細 + 公開エントリー一覧 (画像 signed URL 付き)。
 *
 * cached helper でメタデータを取得し、Route Handler 本体で signed URL を発行する。
 * 詳細は ADR-005 参照。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const copy = getCatalogRouteCopy(getRouteLocale(request));
  const { slug } = await params;

  try {
    const campaign = await getCachedCampaignBySlug(slug);

    if (campaign == null) {
      return jsonError(
        copy.campaignNotFound,
        "CATALOG_CAMPAIGN_NOT_FOUND",
        404,
      );
    }

    const entries = await getCachedPublicEntriesByCampaign(
      campaign.id,
      campaign.slug,
    );

    const adminClient = createAdminClient();
    const allPaths = [
      ...(campaign.cover_storage_path != null
        ? [campaign.cover_storage_path]
        : []),
      ...entries.map((e) => e.image_storage_path),
    ];
    const { urls } = await createCatalogSignedUrls(
      adminClient,
      allPaths,
      SIGNED_URL_TTL_SECONDS,
    );
    const pathToUrl = new Map<string, string | null>();
    allPaths.forEach((p, i) => pathToUrl.set(p, urls[i] ?? null));

    return NextResponse.json({
      campaign: {
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
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        display_name: entry.display_name,
        x_account_url: entry.x_account_url,
        source_tweet_url: entry.source_tweet_url,
        image_url: pathToUrl.get(entry.image_storage_path) ?? null,
        alt: entry.alt,
        display_order: entry.display_order,
        approved_at: entry.approved_at,
      })),
      signed_url_ttl_seconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    console.error("[catalog GET campaign by slug] failed", error);
    return jsonError(copy.entriesFetchFailed, "CATALOG_DETAIL_FAILED", 500);
  }
}
