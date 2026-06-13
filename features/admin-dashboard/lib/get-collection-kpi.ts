import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCollectionKpi,
  type CollectionCompletionRow,
  type CollectionEventRow,
  type CollectionImageJobRow,
  type CollectionKpi,
} from "./build-collection-kpi";

export type {
  CollectionKpi,
  CollectionKpiMetric,
  CollectionTrendPoint,
  OutfitGenerationCount,
} from "./build-collection-kpi";

/**
 * 指定シリーズの KPI を期間付きで集計する。admin 専用。
 * - 範囲 [previousStart, now] で行を取得し、純関数 buildCollectionKpi で
 *   current / previous(前期間比) / 日別トレンド に集計する。
 * - completions / mountsFailed: collection_completions(completed_at で範囲絞り)
 * - seriesGenerations / outfitCounts: image_jobs(成功ジョブ・created_at で範囲絞り)
 * - ファネル: style_usage_events を当該カテゴリの preset id で絞って集計
 */
export async function getCollectionKpi(params: {
  categoryKey: string;
  categoryId: string;
  currentStart: Date;
  previousStart: Date;
  now: Date;
}): Promise<CollectionKpi> {
  const supabase = createAdminClient();
  const startIso = params.previousStart.toISOString();
  const endIso = params.now.toISOString();

  // 当該カテゴリの preset 一覧(柱名ラベル + 表示順 + ファネル絞り込みに使う)
  const { data: presetRows } = await supabase
    .from("style_presets")
    .select("id, display_order, title")
    .eq("category_id", params.categoryId)
    .order("display_order", { ascending: true });
  const presets = (presetRows ?? []).map((p) => ({
    id: p.id as string,
    label: (p.title as string | null) ?? (p.id as string).slice(0, 8),
  }));
  const presetIds = presets.map((p) => p.id);

  const [completionsResult, imageJobsResult, eventsResult, sharesResult] =
    await Promise.all([
      supabase
        .from("collection_completions")
        .select("mount_status, completed_at")
        .eq("category_key", params.categoryKey)
        .gte("completed_at", startIso)
        .lte("completed_at", endIso),
      supabase
        .from("image_jobs")
        .select("created_at, generation_metadata")
        .eq("style_preset_category_key", params.categoryKey)
        .eq("status", "succeeded")
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      presetIds.length > 0
        ? supabase
            .from("style_usage_events")
            .select("auth_state, event_type, created_at")
            .in("style_id", presetIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
        : Promise.resolve({ data: [] as CollectionEventRow[], error: null }),
      // mount_shared は style_id を持たないため series で絞れない。
      // 期間中の全コレクションのシェア数を取得する(稼働コレが1つなら実質その series)。
      supabase
        .from("style_usage_events")
        .select("auth_state, event_type, created_at")
        .eq("event_type", "mount_shared")
        .gte("created_at", startIso)
        .lte("created_at", endIso),
    ]);

  return buildCollectionKpi({
    categoryKey: params.categoryKey,
    presets,
    completionRows: (completionsResult.data ?? []) as CollectionCompletionRow[],
    imageJobRows: (imageJobsResult.data ?? []) as CollectionImageJobRow[],
    eventRows: (eventsResult.data ?? []) as CollectionEventRow[],
    shareRows: (sharesResult.data ?? []) as CollectionEventRow[],
    currentStart: params.currentStart,
    previousStart: params.previousStart,
    now: params.now,
  });
}
