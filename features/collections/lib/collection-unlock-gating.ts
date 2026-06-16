import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { isPresetUnlocked } from "./collection-unlock";

/**
 * ユーザーごとの解放判定に必要なコンテキスト。
 *
 * - `prerequisiteCompletedKeys`: そのユーザーが完走済みの「前提条件カテゴリ key」集合。
 *   あるカテゴリの `unlockPrerequisiteKey` がこの集合に含まれていれば、前提クリア。
 * - `distinctGeneratedByCategoryKey`: カテゴリ key ごとの distinct 生成体数。
 *   段階解放(drip)の解放数算出に使う。未登録カテゴリは 0 とみなす。
 */
export interface CollectionUnlockContext {
  prerequisiteCompletedKeys: ReadonlySet<string>;
  distinctGeneratedByCategoryKey: ReadonlyMap<string, number>;
}

/**
 * /style の配信用に、解放ゲート(前提条件カテゴリの完走 + 段階解放)を
 * ユーザーごとに適用する純粋関数。
 *
 * - `unlockPrerequisiteKey` が null のカテゴリ → 一切変更しない(従来挙動)。
 * - 前提条件カテゴリが未完走のユーザー → そのカテゴリのプリセットを「一覧から完全に除去」
 *   (ティザーを出さない方針)。
 * - 完走済みユーザー → プリセットは残すが、sort_order 昇順で解放数を超えるものに
 *   `locked: true` を立て、UI 側でシルエット(選択・生成不可)として表示する。
 *
 * 入力 `presets` は sort_order 昇順で並んでいる前提(listPublishedStylePresets の order)。
 * カテゴリ内での出現順をそのまま sort_order 上の index とみなす。
 */
export function applyCollectionUnlockGating(
  presets: readonly StylePresetPublicSummary[],
  context: CollectionUnlockContext,
): StylePresetPublicSummary[] {
  // カテゴリ key ごとの総プリセット数(同カテゴリのみで数える)。
  const totalByCategoryKey = new Map<string, number>();
  for (const preset of presets) {
    const key = preset.category.key;
    totalByCategoryKey.set(key, (totalByCategoryKey.get(key) ?? 0) + 1);
  }

  // カテゴリ内での出現 index(= sort_order 昇順の位置)を採番するためのカウンタ。
  const seenCountByCategoryKey = new Map<string, number>();
  const result: StylePresetPublicSummary[] = [];

  for (const preset of presets) {
    const category = preset.category;
    const indexInCategory = seenCountByCategoryKey.get(category.key) ?? 0;
    seenCountByCategoryKey.set(category.key, indexInCategory + 1);

    // 前提条件なし(従来カテゴリ) → そのまま通す。
    if (!category.unlockPrerequisiteKey) {
      result.push(preset);
      continue;
    }

    // 前提条件カテゴリ未完走 → 一覧から除去(ティザーなし)。
    if (!context.prerequisiteCompletedKeys.has(category.unlockPrerequisiteKey)) {
      continue;
    }

    // 完走済み → 段階解放。解放数を超えるものは locked にして残す。
    const distinctGenerated =
      context.distinctGeneratedByCategoryKey.get(category.key) ?? 0;
    const total = totalByCategoryKey.get(category.key) ?? 0;
    const unlocked = isPresetUnlocked(
      indexInCategory,
      distinctGenerated,
      category.progressiveBatchSize,
      total,
    );

    result.push(unlocked ? preset : { ...preset, locked: true });
  }

  return result;
}
