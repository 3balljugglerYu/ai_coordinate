import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPublishedCampaignBySlug,
  getPublicEntryById,
  listPublicEntriesByCampaignId,
  listPublishedCampaigns,
  type CatalogCampaignRow,
  type CatalogPublicEntryRow,
} from "./repository";

/**
 * 絵師カタログの公開閲覧用 cached helper 群。
 *
 * 設計方針 (ADR-005):
 * - `"use cache"` はここの helper に閉じ込め、Route Handler 本体には書かない
 * - signed URL は TTL があるため cache 対象に含めない (Route Handler 側でレスポンス生成直前に発行)
 * - cacheTag は per-campaign で発行し、承認 / 差戻し時に revalidateTag で即時失効
 */

const CATALOG_CAMPAIGNS_TAG = "catalog-campaigns";

export function catalogCampaignTag(slug: string): string {
  return `catalog-campaign-${slug}`;
}

export function catalogEntryTag(entryId: string): string {
  return `catalog-entry-${entryId}`;
}

export async function getCachedPublishedCampaigns(): Promise<
  CatalogCampaignRow[]
> {
  "use cache";
  cacheTag(CATALOG_CAMPAIGNS_TAG);
  cacheLife("minutes");

  const client = createAdminClient();
  const { data, error } = await listPublishedCampaigns(client);
  if (error) {
    console.error("[catalog] cached publish campaigns failed", error);
    return [];
  }
  return data ?? [];
}

export async function getCachedCampaignBySlug(
  slug: string,
): Promise<CatalogCampaignRow | null> {
  "use cache";
  cacheTag(catalogCampaignTag(slug));
  cacheLife("minutes");

  const client = createAdminClient();
  const { data, error } = await getPublishedCampaignBySlug(client, slug);
  if (error) {
    console.error("[catalog] cached get campaign by slug failed", error);
    return null;
  }
  return data;
}

export async function getCachedPublicEntriesByCampaign(
  campaignId: string,
  campaignSlug: string,
): Promise<CatalogPublicEntryRow[]> {
  "use cache";
  cacheTag(catalogCampaignTag(campaignSlug));
  cacheLife("minutes");

  const client = createAdminClient();
  const { data, error } = await listPublicEntriesByCampaignId(
    client,
    campaignId,
  );
  if (error) {
    console.error("[catalog] cached list entries failed", error);
    return [];
  }
  return data ?? [];
}

export async function getCachedPublicEntryById(
  entryId: string,
): Promise<CatalogPublicEntryRow | null> {
  "use cache";
  cacheTag(catalogEntryTag(entryId));
  cacheLife("minutes");

  const client = createAdminClient();
  const { data, error } = await getPublicEntryById(client, entryId);
  if (error) {
    console.error("[catalog] cached get entry by id failed", error);
    return null;
  }
  return data;
}

export const CATALOG_CACHE_TAGS = {
  campaigns: CATALOG_CAMPAIGNS_TAG,
  campaign: catalogCampaignTag,
  entry: catalogEntryTag,
} as const;
