import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface OutfitGenerationCount {
  presetId: string;
  count: number;
}

export interface CollectionKpi {
  categoryKey: string;
  completions: number;
  mountsFailed: number;
  seriesGenerations: number;
  outfitCounts: OutfitGenerationCount[];
  // 企画ファネル(style_usage_events を当該シリーズの preset で絞って集計)
  visitsMember: number;
  visitsGuest: number;
  generates: number;
  downloads: number;
  saveClicks: number;
  signupClicks: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function countEvents(
  supabase: AdminClient,
  presetIds: string[],
  eventType: string,
  authState?: "authenticated" | "guest",
): Promise<number> {
  if (presetIds.length === 0) return 0;
  let query = supabase
    .from("style_usage_events")
    .select("id", { count: "exact", head: true })
    .in("style_id", presetIds)
    .eq("event_type", eventType);
  if (authState) {
    query = query.eq("auth_state", authState);
  }
  const { count } = await query;
  return count ?? 0;
}

/**
 * 指定シリーズの KPI を集計する。admin 専用。
 * - completions / mountsFailed: collection_completions(耐久データ)
 * - seriesGenerations / outfitCounts: image_jobs(成功ジョブ)
 * - ファネル: style_usage_events を当該カテゴリの preset id で絞って集計
 */
export async function getCollectionKpi(params: {
  categoryKey: string;
  categoryId: string;
}): Promise<CollectionKpi> {
  const supabase = createAdminClient();

  const [{ count: completions }, { count: mountsFailed }] = await Promise.all([
    supabase
      .from("collection_completions")
      .select("id", { count: "exact", head: true })
      .eq("category_key", params.categoryKey)
      .eq("mount_status", "completed"),
    supabase
      .from("collection_completions")
      .select("id", { count: "exact", head: true })
      .eq("category_key", params.categoryKey)
      .eq("mount_status", "failed"),
  ]);

  const { count: seriesGenerations } = await supabase
    .from("image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("style_preset_category_key", params.categoryKey)
    .eq("status", "succeeded");

  // 当該カテゴリの preset 一覧(衣装別集計 + ファネル絞り込みに使う)
  const { data: presets } = await supabase
    .from("style_presets")
    .select("id, display_order")
    .eq("category_id", params.categoryId)
    .order("display_order", { ascending: true });
  const presetIds = (presets ?? []).map((p) => p.id as string);

  const outfitCounts: OutfitGenerationCount[] = [];
  for (const presetId of presetIds) {
    const { count } = await supabase
      .from("image_jobs")
      .select("id", { count: "exact", head: true })
      .eq("style_preset_category_key", params.categoryKey)
      .eq("status", "succeeded")
      .eq("generation_metadata->oneTapStyle->>id", presetId);
    outfitCounts.push({ presetId, count: count ?? 0 });
  }

  const [
    visitsMember,
    visitsGuest,
    generates,
    downloads,
    saveClicks,
    signupClicks,
  ] = await Promise.all([
    countEvents(supabase, presetIds, "visit", "authenticated"),
    countEvents(supabase, presetIds, "visit", "guest"),
    countEvents(supabase, presetIds, "generate"),
    countEvents(supabase, presetIds, "download"),
    countEvents(supabase, presetIds, "wardrobe_save_click"),
    countEvents(supabase, presetIds, "signup_click"),
  ]);

  return {
    categoryKey: params.categoryKey,
    completions: completions ?? 0,
    mountsFailed: mountsFailed ?? 0,
    seriesGenerations: seriesGenerations ?? 0,
    outfitCounts,
    visitsMember,
    visitsGuest,
    generates,
    downloads,
    saveClicks,
    signupClicks,
  };
}
