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
import {
  buildCollectionParticipation,
  type CollectionParticipation,
} from "./build-collection-participation";
import {
  excludeOperatorRows,
  excludeOperatorUserIds,
} from "./operator-exclusion";

export type { CollectionUuFunnel } from "./build-collection-uu-funnel";
export type {
  CollectionParticipation,
  CollectionPageReach,
  CollectionPageCountBucket,
} from "./build-collection-participation";

/**
 * KPI に「どこで止まったか」を足した戻り値。
 * 追加のクエリは要らない(同じ image_jobs / collection_completions の行を使い回す)。
 */
export interface CollectionKpiWithParticipation extends CollectionKpi {
  participation: CollectionParticipation;
}

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
 *   (visit だけは style_id を持たないため category_key で別途取得する)
 *
 * すべてのクエリで `user_id` も取得し、集計前に運営の行を落とす(ADR-002)。
 * PostgREST 側で `not.in` を使うとゲスト行(user_id が NULL)まで落ちるため、
 * 取得後に純関数で除外している(`operator-exclusion.ts` に理由と実測値)。
 */
export async function getCollectionKpi(params: {
  categoryKey: string;
  categoryId: string;
  currentStart: Date;
  previousStart: Date;
  now: Date;
  /** 除外する運営の user_id。`getOperatorUserIds()` の結果を渡す */
  operatorUserIds: string[];
}): Promise<CollectionKpiWithParticipation> {
  const supabase = createAdminClient();
  const startIso = params.previousStart.toISOString();
  const endIso = params.now.toISOString();
  const operators = params.operatorUserIds;

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

  const [
    completionsResult,
    imageJobsResult,
    eventsResult,
    visitsResult,
    sharesResult,
  ] = await Promise.all([
      supabase
        .from("collection_completions")
        .select("mount_status, completed_at, user_id")
        .eq("category_key", params.categoryKey)
        .gte("completed_at", startIso)
        .lte("completed_at", endIso),
      supabase
        .from("image_jobs")
        .select("created_at, generation_metadata, user_id")
        .eq("style_preset_category_key", params.categoryKey)
        .eq("status", "succeeded")
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      presetIds.length > 0
        ? supabase
            .from("style_usage_events")
            .select("auth_state, event_type, created_at, user_id")
            .in("style_id", presetIds)
            // visit は下の category_key クエリで数える。
            // route 側で style_id を null に正規化しているが、集計側でも
            // 除外して二重計上を二重に防ぐ(旧データ・将来の caller 対策)。
            .neq("event_type", "visit")
            .gte("created_at", startIso)
            .lte("created_at", endIso)
        : Promise.resolve({ data: [] as CollectionEventRow[], error: null }),
      /*
        visit は style_id を持たない(1訪問=1プリセットではない)。
        上の presetIds クエリには1件もヒットせず、**訪問カードは構造的に
        常に 0 を表示していた**。企画別の訪問は category_key で数える。
        二重計上は3重に防いでいる: route が visit の style_id を null に正規化 /
        上のクエリが visit を除外 / このクエリが visit だけを取る。
        category_key の計装は 2026-08-17 開始 = それ以前の訪問は取れない。
        「取れていない」ことは collection-metric-availability.ts が画面に伝える。
      */
      supabase
        .from("style_usage_events")
        .select("auth_state, event_type, created_at, viewer_key, user_id")
        .eq("event_type", "visit")
        .eq("category_key", params.categoryKey)
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      // mount_shared は category_key を style_id に格納して記録(share-event route)。
      // series 固有のシェア数で絞る(計装変更前の旧 share は style_id=null のため対象外)。
      supabase
        .from("style_usage_events")
        .select("auth_state, event_type, created_at, user_id")
        .eq("event_type", "mount_shared")
        .eq("style_id", params.categoryKey)
        .gte("created_at", startIso)
        .lte("created_at", endIso),
    ]);

  // 運営を除いた行。KPI と参加状況で**同じ行**を使う(母数がずれない)
  const completionRows = excludeOperatorRows(
    (completionsResult.data ?? []) as CollectionCompletionRow[],
    operators,
  );
  const imageJobRows = excludeOperatorRows(
    (imageJobsResult.data ?? []) as CollectionImageJobRow[],
    operators,
  );

  const kpi = buildCollectionKpi({
    categoryKey: params.categoryKey,
    presets,
    completionRows,
    imageJobRows,
    eventRows: [
      ...excludeOperatorRows(
        (eventsResult.data ?? []) as CollectionEventRow[],
        operators,
      ),
      ...excludeOperatorRows(
        (visitsResult.data ?? []) as CollectionEventRow[],
        operators,
      ),
    ],
    shareRows: excludeOperatorRows(
      (sharesResult.data ?? []) as CollectionEventRow[],
      operators,
    ),
    currentStart: params.currentStart,
    previousStart: params.previousStart,
    now: params.now,
  });

  return {
    ...kpi,
    participation: buildCollectionParticipation({
      presets,
      imageJobRows,
      completionRows,
      currentStart: params.currentStart,
      now: params.now,
    }),
  };
}

type UserIdRow = { user_id: string | null };
type ViewerKeyRow = { viewer_key: string | null; user_id?: string | null };

function viewerKeys(
  rows: ViewerKeyRow[] | null,
  operatorUserIds: string[],
): (string | null)[] {
  return excludeOperatorRows(rows ?? [], operatorUserIds).map(
    (row) => row.viewer_key,
  );
}

function distinctUserIds(
  rows: UserIdRow[] | null,
  operatorUserIds: string[],
): string[] {
  return excludeOperatorUserIds(
    (rows ?? []).map((row) => row.user_id),
    operatorUserIds,
  );
}

/**
 * 指定シリーズのユニークユーザー(UU)ファネルを取得する(現在期間のみ)。
 * - 生成UU(ログイン) → コンプリートUU → シェアUU、および期間内登録UU → コンプリート
 * - 訪問UU とゲストUU は viewer_key で数える(ゲストは user_id が NULL のため)。
 *   2026-08-17 の計装以降のぶんだけ。admin 専用。
 *
 * 運営の除外は取得後に行う(ADR-002)。ゲスト経路は user_id を持たないため、
 * viewer_key ベースの UU は実質そのまま残る(運営がログアウト状態で見た場合は
 * 区別できない。ここは割り切り)。
 */
export async function getCollectionUuFunnel(params: {
  categoryKey: string;
  categoryId: string;
  currentStart: Date;
  now: Date;
  operatorUserIds: string[];
}): Promise<CollectionUuFunnel> {
  const supabase = createAdminClient();
  const startIso = params.currentStart.toISOString();
  const endIso = params.now.toISOString();
  const operators = params.operatorUserIds;

  const { data: presetRows } = await supabase
    .from("style_presets")
    .select("id")
    .eq("category_id", params.categoryId);
  const presetIds = (presetRows ?? []).map((p) => p.id as string);

  const [
    genResult,
    completedResult,
    shareResult,
    registeredResult,
    visitMemberResult,
    visitGuestResult,
    genGuestResult,
  ] = await Promise.all([
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
      // 訪問UU: visit は style_id を持たないため category_key で絞る。
      supabase
        .from("style_usage_events")
        .select("viewer_key, user_id")
        .eq("event_type", "visit")
        .eq("auth_state", "authenticated")
        .eq("category_key", params.categoryKey)
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      supabase
        .from("style_usage_events")
        .select("viewer_key, user_id")
        .eq("event_type", "visit")
        .eq("auth_state", "guest")
        .eq("category_key", params.categoryKey)
        .gte("created_at", startIso)
        .lte("created_at", endIso),
      // ゲストの生成UU。ゲスト生成は style_id を持つので preset で絞れる。
      presetIds.length > 0
        ? supabase
            .from("style_usage_events")
            .select("viewer_key, user_id")
            .eq("event_type", "generate")
            .eq("auth_state", "guest")
            .in("style_id", presetIds)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
        : Promise.resolve({ data: [] as ViewerKeyRow[], error: null }),
    ]);

  return buildCollectionUuFunnel({
    visitMemberViewerKeys: viewerKeys(
      visitMemberResult.data as ViewerKeyRow[] | null,
      operators,
    ),
    visitGuestViewerKeys: viewerKeys(
      visitGuestResult.data as ViewerKeyRow[] | null,
      operators,
    ),
    generateGuestViewerKeys: viewerKeys(
      genGuestResult.data as ViewerKeyRow[] | null,
      operators,
    ),
    generateMemberUserIds: distinctUserIds(
      genResult.data as UserIdRow[] | null,
      operators,
    ),
    completerUserIds: distinctUserIds(
      completedResult.data as UserIdRow[] | null,
      operators,
    ),
    shareUserIds: distinctUserIds(
      shareResult.data as UserIdRow[] | null,
      operators,
    ),
    registeredUserIds: distinctUserIds(
      registeredResult.data as UserIdRow[] | null,
      operators,
    ),
  });
}
