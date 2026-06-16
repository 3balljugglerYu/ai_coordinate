import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { listPublishedStylePresets } from "@/features/style-presets/lib/style-preset-repository";
import { getCollectionProgress } from "./collection-progress-repository";
import { computeUnlockedCount } from "./collection-unlock";
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
  // 解放ゲートを持つカテゴリだけを対象にする(前提条件なしカテゴリは判定不要)。
  const gatedCategoryKeys = new Set<string>();
  const prerequisiteKeys = new Set<string>();
  for (const preset of presets) {
    const prerequisite = preset.category.unlockPrerequisiteKey;
    if (prerequisite) {
      gatedCategoryKeys.add(preset.category.key);
      prerequisiteKeys.add(prerequisite);
    }
  }

  // ゲート対象が無ければ何もしない(= 既存カテゴリのみのときは完全な no-op)。
  if (gatedCategoryKeys.size === 0) {
    return {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map(),
    };
  }

  const [prerequisiteCompletedKeys, distinctGeneratedByCategoryKey] =
    await Promise.all([
      resolveCompletedPrerequisiteKeys(prerequisiteKeys, authedClient),
      resolveDistinctGeneratedCounts(gatedCategoryKeys, userId),
    ]);

  return { prerequisiteCompletedKeys, distinctGeneratedByCategoryKey };
}

/**
 * get_collection_progress RPC から「完走済み(mount完成)の前提条件カテゴリ key」を抽出する。
 * RPC は auth.uid() を使うため、必ず cookie 認証済みクライアントを渡すこと。
 * 取得失敗時は「未完走」として安全側に倒す(解放対象を出さない)。
 */
async function resolveCompletedPrerequisiteKeys(
  prerequisiteKeys: ReadonlySet<string>,
  authedClient: SupabaseClient,
): Promise<Set<string>> {
  const completed = new Set<string>();
  try {
    const progress = await getCollectionProgress(authedClient);
    for (const row of progress) {
      if (row.isCompleted && prerequisiteKeys.has(row.categoryKey)) {
        completed.add(row.categoryKey);
      }
    }
  } catch (error) {
    // 進捗取得失敗は致命ではない。安全側(未完走扱い = 解放しない)にフォールバック。
    console.error(
      "[collection-unlock-server] failed to resolve prerequisite progress",
      error,
    );
  }
  return completed;
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
 * `unlockPrerequisiteKey` が null のカテゴリ(= 既存カテゴリすべて)は常に許可(no-op)。
 * ゲート付きの場合のみ:
 *   1. 前提条件カテゴリを完走しているか(get_collection_progress RPC)
 *   2. 当該プリセットが sort_order 上で解放数の範囲内か(段階解放)
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
    "key" | "unlockPrerequisiteKey" | "progressiveBatchSize"
  >,
  presetId: string,
  userId: string,
  authedClient: SupabaseClient,
  options: { includeAdminOnly?: boolean } = {},
): Promise<StylePresetUnlockAuthorization> {
  // ゲートなし(従来カテゴリ) → 常に許可。
  if (!category.unlockPrerequisiteKey) {
    return { allowed: true };
  }

  // 1) 前提条件カテゴリの完走チェック。
  const completedKeys = await resolveCompletedPrerequisiteKeys(
    new Set([category.unlockPrerequisiteKey]),
    authedClient,
  );
  if (!completedKeys.has(category.unlockPrerequisiteKey)) {
    return { allowed: false, reason: "prerequisite_incomplete" };
  }

  // 2) 段階解放の範囲内チェック。
  //    sort_order 上の index と総数を、公開一覧(sort_order 昇順)から導出する。
  //    解放ゲート付きカテゴリは解放順を sort_order の降順にするため index を反転し、
  //    applyCollectionUnlockGating(配信側)の降順表示・降順解放と一致させる。
  //    この関数は冒頭で unlockPrerequisiteKey 無しを return 済みなので、ここは常にゲート付き。
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

  // 降順 index(末尾=sort_order 最大 を index 0 とする)。
  const indexInCategory = total - 1 - ascendingIndex;

  const distinctCounts = await resolveDistinctGeneratedCounts(
    new Set([category.key]),
    userId,
  );
  const distinctGenerated = distinctCounts.get(category.key) ?? 0;
  const unlockedCount = computeUnlockedCount(
    distinctGenerated,
    category.progressiveBatchSize,
    total,
  );

  if (indexInCategory >= unlockedCount) {
    return { allowed: false, reason: "preset_locked" };
  }

  return { allowed: true };
}
