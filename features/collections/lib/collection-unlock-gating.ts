import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import {
  isPresetUnlocked,
  sequentialBatchSize,
  unlockJudgmentIndex,
} from "./collection-unlock";

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
  /**
   * 前提カテゴリ key -> その「ユニーク生成数」(コンプリート演出が ack する値)。
   * 解放お知らせを「コンプリート演出の確認後」に出すための比較に使う(任意)。
   */
  prerequisiteUniqueCountByKey?: ReadonlyMap<string, number>;
}

/**
 * /style の配信用に、解放ゲート(前提条件カテゴリの完走 + 段階解放)を
 * ユーザーごとに適用する純粋関数。
 *
 * - `unlockPrerequisiteKey` が null のカテゴリ → 一切変更しない(従来挙動)。
 * - 前提条件カテゴリが未完走のユーザー → そのカテゴリのプリセットを「一覧から完全に除去」
 *   (ティザーを出さない方針)。
 * - 完走済みユーザー → プリセットは残すが、解放数を超えるものに `locked: true` を立て、
 *   UI 側でシルエット(選択・生成不可)として表示する。
 *
 * 入力 `presets` は sort_order 昇順で並んでいる前提(listPublishedStylePresets の order)。
 * **表示順は一切変更しない**(昇順のまま)。
 *
 * 解放順(解放ゲート付きカテゴリは sort_order の「多い順」から解放する):
 *   解放ゲート付きカテゴリ(例: ぷち神)は、表示は sort_order 昇順のままで、段階解放だけを
 *   sort_order の大きい方(末尾)から行う。これにより「シルエット(あとでとうじょう)が前に
 *   まとまり、解放済みが末尾にまとまる」並びになる(例: total=6/解放2なら、先頭4つがシルエット、
 *   末尾2つ=sort 5・4 のアフロディーテ・アルテミスが解放)。解放判定の index だけを反転し、
 *   並べ替えは行わない。前提条件なしの従来カテゴリは従来どおり昇順で先頭から解放。
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
    const ascendingIndex = seenCountByCategoryKey.get(category.key) ?? 0;
    seenCountByCategoryKey.set(category.key, ascendingIndex + 1);

    const hasPrereq = Boolean(category.unlockPrerequisiteKey);
    const sequential = category.sequentialUnlock === true;

    // 前提条件カテゴリ未完走 → 一覧から除去(ティザーなし)。
    if (
      hasPrereq &&
      !context.prerequisiteCompletedKeys.has(category.unlockPrerequisiteKey!)
    ) {
      continue;
    }

    // drip 適用条件: sequential(前提なしでも単独で順次解放) または 前提カテゴリ付き。
    // どちらでもない従来カテゴリは無条件公開(従来挙動)。
    if (!sequential && !hasPrereq) {
      result.push(preset);
      continue;
    }

    // 段階解放。解放数を超えるものは locked にして残す。
    //  - sequential: 先頭(sort_order 最小=表紙)から昇順で解放。batch 未設定は 1。
    //  - 既存(前提付き): sort_order の末尾から降順で解放(index 反転)。
    const distinctGenerated =
      context.distinctGeneratedByCategoryKey.get(category.key) ?? 0;
    const total = totalByCategoryKey.get(category.key) ?? 0;
    const batch = sequential
      ? sequentialBatchSize(category.progressiveBatchSize)
      : category.progressiveBatchSize;
    const unlockIndex = unlockJudgmentIndex(ascendingIndex, total, sequential);
    const unlocked = isPresetUnlocked(unlockIndex, distinctGenerated, batch, total);

    result.push(unlocked ? preset : { ...preset, locked: true });
  }

  return result;
}
