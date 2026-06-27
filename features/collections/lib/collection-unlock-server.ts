import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";
import { getCollectionProgress } from "./collection-progress-repository";
import {
  computeUnlockedCount,
  sequentialBatchSize,
  unlockJudgmentIndex,
} from "./collection-unlock";
import type { CollectionUnlockContext } from "./collection-unlock-gating";

/**
 * 解放ゲート(unlock gating)のユーザー別判定に必要なデータを集めるサーバー専用ロジック。
 *
 * 設計上の注意(RPC の返却形状):
 *   `get_collection_progress` RPC は `is_collection_series = true AND visibility = 'public'`
 *   のカテゴリ行しか返さない。
 *   - 前提条件カテゴリ(例: collectible_wafer_sticker_god_6p)は collection series なので
 *     RPC に現れ、そこから `isCompleted` を取得できる → 完走判定に使う。
 *   - 一方、解放対象カテゴリ(例: collectible_wafer_sticker_god_petit_6p)は
 *     `is_collection_series = false` かつ `visibility = 'admin_only'` のため RPC に現れない。
 *     よって distinct 生成体数は get_collection_progress では取れず、専用の
 *     service_role RPC `count_distinct_styles_by_category` で DB 側集計する
 *     (RPC 内の unique_count と同じロジック: status='succeeded' かつ
 *      generation_metadata->'oneTapStyle'->>'id' の DISTINCT 数)。
 *   この「完走は get_collection_progress / distinct は専用 RPC」のハイブリッドが、
 *   対象カテゴリの series/visibility 設定に依存せず最も堅牢。
 *
 * @param presets 解放判定の対象となりうるプリセット一覧(キャッシュ済みの公開一覧)
 * @param userId 認証済みユーザー ID
 * @param authedClient cookie 認証済みサーバークライアント(get_collection_progress 用)
 */
export async function resolveCollectionUnlockContext(
  presets: readonly StylePresetPublicSummary[],
  userId: string,
  authedClient: SupabaseClient,
): Promise<CollectionUnlockContext> {
  // 解放ゲートを持つカテゴリ(前提付き)＋ sequential(前提なしで単独順次解放)を対象にする。
  // sequential も distinct 集計が必要なため gatedCategoryKeys に含める。
  const gatedCategoryKeys = new Set<string>();
  const prerequisiteKeys = new Set<string>();
  for (const preset of presets) {
    const prerequisite = preset.category.unlockPrerequisiteKey;
    if (prerequisite) {
      gatedCategoryKeys.add(preset.category.key);
      prerequisiteKeys.add(prerequisite);
    } else if (preset.category.sequentialUnlock === true) {
      gatedCategoryKeys.add(preset.category.key);
    }
  }

  // ゲート対象が無ければ何もしない(= 既存カテゴリのみのときは完全な no-op)。
  if (gatedCategoryKeys.size === 0) {
    return {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map(),
    };
  }

  const [prerequisiteProgress, distinctGeneratedByCategoryKey] =
    await Promise.all([
      resolveCompletedPrerequisiteKeys(prerequisiteKeys, authedClient),
      resolveDistinctGeneratedCounts(gatedCategoryKeys, userId),
    ]);

  return {
    prerequisiteCompletedKeys: prerequisiteProgress.completedKeys,
    distinctGeneratedByCategoryKey,
    prerequisiteUniqueCountByKey: prerequisiteProgress.uniqueCountByKey,
  };
}

/**
 * get_collection_progress RPC から「完走済み(mount完成)の前提条件カテゴリ key」と、
 * その「ユニーク生成数」(コンプリート演出が ack する値)を抽出する。
 * RPC は auth.uid() を使うため、必ず cookie 認証済みクライアントを渡すこと。
 * 取得失敗時は「未完走」として安全側に倒す(解放対象を出さない)。
 */
async function resolveCompletedPrerequisiteKeys(
  prerequisiteKeys: ReadonlySet<string>,
  authedClient: SupabaseClient,
): Promise<{ completedKeys: Set<string>; uniqueCountByKey: Map<string, number> }> {
  const completedKeys = new Set<string>();
  const uniqueCountByKey = new Map<string, number>();
  try {
    const progress = await getCollectionProgress(authedClient);
    for (const row of progress) {
      if (row.isCompleted && prerequisiteKeys.has(row.categoryKey)) {
        completedKeys.add(row.categoryKey);
        uniqueCountByKey.set(row.categoryKey, row.uniqueOutfitCount);
      }
    }
  } catch (error) {
    // 進捗取得失敗は致命ではない。安全側(未完走扱い = 解放しない)にフォールバック。
    console.error(
      "[collection-unlock-server] failed to resolve prerequisite progress",
      error,
    );
  }
  return { completedKeys, uniqueCountByKey };
}

/**
 * ゲート対象カテゴリごとの distinct 生成体数を DB 側 RPC で集計する。
 *
 * 以前は image_jobs を select してアプリ側でメモリ集計していたが、PostgREST の
 * デフォルト行制限(1000行)に達すると不正確になり得るため、集計を DB に寄せた
 * (count_distinct_styles_by_category / get_collection_progress と同じロジック)。
 * service_role 専用 RPC なので admin client から user_id を明示して呼ぶ。
 * 取得失敗時は 0 のまま返し、安全側(非解放)に倒す。
 */
async function resolveDistinctGeneratedCounts(
  categoryKeys: ReadonlySet<string>,
  userId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const key of categoryKeys) {
    counts.set(key, 0);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc(
      "count_distinct_styles_by_category",
      {
        p_user_id: userId,
        p_category_keys: Array.from(categoryKeys),
      },
    );

    if (error) {
      console.error(
        "[collection-unlock-server] failed to count distinct generated via RPC",
        error,
      );
      return counts;
    }

    for (const row of (data ?? []) as Array<{
      category_key: string | null;
      unique_count: number | null;
    }>) {
      const key = row.category_key;
      if (!key || !categoryKeys.has(key)) continue;
      counts.set(key, Number(row.unique_count) || 0);
    }
  } catch (error) {
    console.error(
      "[collection-unlock-server] unexpected error counting generated",
      error,
    );
  }

  return counts;
}

/** 解放ゲートの認可結果。allowed=false のとき reason がエラーコード相当を持つ。 */
export type StylePresetUnlockAuthorization =
  | { allowed: true }
  | { allowed: false; reason: "prerequisite_incomplete" | "preset_locked" };

/**
 * generate route のサーバー側認可: 解放ゲート付きカテゴリのプリセット生成を許可するか。
 *
 * ゲート対象は「unlock_prerequisite_key 付き」または「sequential_unlock=true」のカテゴリ。
 * どちらでもないカテゴリ(両方 null/false)は常に許可(no-op)。
 * ゲート対象の場合のみ:
 *   1. (前提付きのとき)前提条件カテゴリを完走しているか(get_collection_progress RPC)
 *   2. 当該プリセットが sort_order 上で解放数の範囲内か(段階解放。
 *      sequential=昇順[先頭=表紙から] / 既存=降順[末尾から]、unlockJudgmentIndex で共有)
 * を検証する。UI 非表示はセキュリティではないため、ここで必ず弾く。
 *
 * @param category 生成対象プリセットのカテゴリ参照(unlock 列を含む)
 * @param presetId 生成対象プリセット ID
 * @param userId 認証済みユーザー ID
 * @param authedClient cookie 認証済みサーバークライアント
 * @param options.includeAdminOnly admin プレビュー時に admin_only も対象にするか
 */
export async function authorizeStylePresetUnlock(
  category: Pick<
    StylePresetPublicSummary["category"],
    "key" | "unlockPrerequisiteKey" | "progressiveBatchSize" | "sequentialUnlock"
  >,
  presetId: string,
  userId: string,
  authedClient: SupabaseClient,
  options: { includeAdminOnly?: boolean } = {},
): Promise<StylePresetUnlockAuthorization> {
  const hasPrereq = Boolean(category.unlockPrerequisiteKey);
  const sequential = category.sequentialUnlock === true;

  // ゲートなし(前提なし かつ sequential でもない従来カテゴリ) → 常に許可。
  if (!hasPrereq && !sequential) {
    return { allowed: true };
  }

  // 1) 前提条件カテゴリの完走チェック(前提付きのときのみ)。
  if (hasPrereq) {
    const { completedKeys } = await resolveCompletedPrerequisiteKeys(
      new Set([category.unlockPrerequisiteKey!]),
      authedClient,
    );
    if (!completedKeys.has(category.unlockPrerequisiteKey!)) {
      return { allowed: false, reason: "prerequisite_incomplete" };
    }
  }

  // 2) 段階解放の範囲内チェック。
  //    sort_order 上の index と総数を、公開一覧(sort_order 昇順)から導出する。
  //    方向は配信側 applyCollectionUnlockGating と共有ヘルパー(unlockJudgmentIndex)で一致させる:
  //    sequential は昇順(先頭=表紙から)、既存ゲートは降順(末尾から)。
  const published = await listPublishedStylePresets({
    includeAdminOnly: options.includeAdminOnly === true,
  });
  const sameCategory = published.filter((p) => p.category.key === category.key);
  const total = sameCategory.length;
  const ascendingIndex = sameCategory.findIndex((p) => p.id === presetId);

  // 一覧に存在しない(= 配信対象外)場合は安全側で拒否。
  if (ascendingIndex < 0) {
    return { allowed: false, reason: "preset_locked" };
  }

  const indexInCategory = unlockJudgmentIndex(ascendingIndex, total, sequential);

  const distinctCounts = await resolveDistinctGeneratedCounts(
    new Set([category.key]),
    userId,
  );
  const distinctGenerated = distinctCounts.get(category.key) ?? 0;
  const batch = sequential
    ? sequentialBatchSize(category.progressiveBatchSize)
    : category.progressiveBatchSize;
  const unlockedCount = computeUnlockedCount(distinctGenerated, batch, total);

  if (indexInCategory >= unlockedCount) {
    return { allowed: false, reason: "preset_locked" };
  }

  return { allowed: true };
}
