/**
 * 絵師カタログ機能 - 管理者用 DB アクセス層
 *
 * 必ず service-role client を受け取って動作する。
 * 呼出側 API ハンドラで `requireAdmin()` を必ず先行実行すること。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CatalogCampaignRow,
  CatalogCampaignStatus,
  CatalogEntryStatus,
} from "./repository";

export interface AdminCatalogEntryRow {
  id: string;
  campaign_id: string;
  submitter_user_id: string | null;
  submitter_token: string;
  display_name: string;
  x_account_url: string;
  source_tweet_url: string;
  source_tweet_status_id: string;
  source_tweet_snapshot: string | null;
  image_storage_path: string;
  alt: string | null;
  submitter_email: string | null;
  copyright_consent_at: string;
  copyright_consent_version: string;
  status: CatalogEntryStatus;
  rejection_reason: string | null;
  approved_at: string | null;
  decided_by: string | null;
  admin_note: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const ADMIN_ENTRY_FIELDS = `
  id,
  campaign_id,
  submitter_user_id,
  submitter_token,
  display_name,
  x_account_url,
  source_tweet_url,
  source_tweet_status_id,
  source_tweet_snapshot,
  image_storage_path,
  alt,
  submitter_email,
  copyright_consent_at,
  copyright_consent_version,
  status,
  rejection_reason,
  approved_at,
  decided_by,
  admin_note,
  display_order,
  created_at,
  updated_at
` as const;

// ===============================================
// Campaign 管理 (admin)
// ===============================================

export async function listCampaignsAdmin(
  client: SupabaseClient,
  options: {
    status?: CatalogCampaignStatus;
    limit?: number;
  } = {},
): Promise<{
  data: CatalogCampaignRow[] | null;
  error: { message: string } | null;
}> {
  const { status, limit = 100 } = options;
  let query = client
    .from("catalog_campaigns")
    .select("*")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  return {
    data: (data as CatalogCampaignRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

export async function createCampaign(
  client: SupabaseClient,
  input: {
    slug: string;
    title: string;
    description?: string | null;
    cover_storage_path?: string | null;
    theme_hashtag?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    display_order?: number;
  },
): Promise<{
  data: CatalogCampaignRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("catalog_campaigns")
    .insert({
      slug: input.slug,
      title: input.title,
      description: input.description || null,
      cover_storage_path: input.cover_storage_path || null,
      theme_hashtag: input.theme_hashtag || null,
      start_at: input.start_at || null,
      end_at: input.end_at || null,
      display_order: input.display_order ?? 0,
      status: "draft",
    })
    .select("*")
    .single();

  return {
    data: (data as CatalogCampaignRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

export async function updateCampaign(
  client: SupabaseClient,
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    cover_storage_path: string | null;
    theme_hashtag: string | null;
    start_at: string | null;
    end_at: string | null;
    display_order: number;
    status: CatalogCampaignStatus;
  }>,
): Promise<{
  data: CatalogCampaignRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("catalog_campaigns")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  return {
    data: (data as CatalogCampaignRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

export async function deleteCampaign(
  client: SupabaseClient,
  id: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await client
    .from("catalog_campaigns")
    .delete()
    .eq("id", id);

  return { error: error ? { message: error.message } : null };
}

// ===============================================
// Entry 管理 (admin)
// ===============================================

export async function listEntriesAdmin(
  client: SupabaseClient,
  options: {
    campaignId?: string;
    status?: CatalogEntryStatus;
    limit?: number;
  } = {},
): Promise<{
  data: AdminCatalogEntryRow[] | null;
  error: { message: string } | null;
}> {
  const { campaignId, status, limit = 100 } = options;
  let query = client
    .from("catalog_entries")
    .select(ADMIN_ENTRY_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  return {
    data: (data as AdminCatalogEntryRow[] | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

export async function getEntryByIdAdmin(
  client: SupabaseClient,
  id: string,
): Promise<{
  data: AdminCatalogEntryRow | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client
    .from("catalog_entries")
    .select(ADMIN_ENTRY_FIELDS)
    .eq("id", id)
    .maybeSingle();

  return {
    data: (data as AdminCatalogEntryRow | null) ?? null,
    error: error ? { message: error.message } : null,
  };
}

export async function updateEntryOrder(
  client: SupabaseClient,
  id: string,
  displayOrder: number,
): Promise<{ error: { message: string } | null }> {
  const { error } = await client
    .from("catalog_entries")
    .update({ display_order: displayOrder })
    .eq("id", id);

  return { error: error ? { message: error.message } : null };
}
