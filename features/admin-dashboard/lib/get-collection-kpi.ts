import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCollectionKpi,
  type CollectionCompletionRow,
  type CollectionEventRow,
  type CollectionImageJobRow,
  type CollectionKpi,
} from "./build-collection-kpi";
import {
  buildCollectionUuFunnel,
  type CollectionUuFunnel,
} from "./build-collection-uu-funnel";

export type { CollectionUuFunnel } from "./build-collection-uu-funnel";

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
      // mount_shared は category_key を style_id に格納して記録(share-event route)。
      // series 固有のシェア数で絞る(計装変更前の旧 share は style_id=null のため対象外)。
      supabase
        .from("style_usage_events")
        .select("auth_state, event_type, created_at")
        .eq("event_type", "mount_shared")
        .eq("style_id", params.categoryKey)
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

type UserIdRow = { user_id: string | null };

function distinctUserIds(rows: UserIdRow[] | null): string[] {
  return (rows ?? [])
    .map((row) => row.user_id)
    .filter((value): value is string => Boolean(value));
}

/**
 * 指定シリーズのユニークユーザー(UU)ファネルを取得する(現在期間のみ)。
 * - 生成UU(ログイン) → コンプリートUU → シェアUU、および期間内登録UU → コンプリート
 * - ゲストは user_id=NULL のため UU 計測対象外(ログイン側のみ)。admin 専用。
 */
export async function getCollectionUuFunnel(params: {
  categoryKey: string;
  categoryId: string;
  currentStart: Date;
  now: Date;
}): Promise<CollectionUuFunnel> {
  const supabase = createAdminClient();
  const startIso = params.currentStart.toISOString();
  const endIso = params.now.toISOString();

  const { data: presetRows } = await supabase
    .from("style_presets")
    .select("id")
    .eq("category_id", params.categoryId);
  const presetIds = (presetRows ?? []).map((p) => p.id as string);

  const [genResult, completedResult, shareResult, registeredResult] =
    await Promise.all([
      presetIds.length > 0
        ? supabase
            .from("style_usage_events")
            .select("user_id")
            .eq("event_type", "generate")
            .eq("auth_state", "authenticated")
            .in("style_id", presetIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
        : Promise.resolve({ data: [] as UserIdRow[], error: null }),
      supabase
        .from("collection_completions")
        .select("user_id")
        .eq("category_key", params.categoryKey)
        .eq("mount_status", "completed")
        .gte("completed_at", startIso)
        .lte("completed_at", endIso),
      supabase
        .from("style_usage_events")
        .select("user_id")
        .eq("event_type", "mount_shared")
        .eq("style_id", params.categoryKey)
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      supabase
        .from("profiles")
        .select("user_id")
        .gte("created_at", startIso)
        .lte("created_at", endIso),
    ]);

  return buildCollectionUuFunnel({
    generateMemberUserIds: distinctUserIds(genResult.data as UserIdRow[] | null),
    completerUserIds: distinctUserIds(completedResult.data as UserIdRow[] | null),
    shareUserIds: distinctUserIds(shareResult.data as UserIdRow[] | null),
    registeredUserIds: distinctUserIds(
      registeredResult.data as UserIdRow[] | null,
    ),
  });
}
