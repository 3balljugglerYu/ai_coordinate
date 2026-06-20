/**
 * マイページ「コレクション」の状態別セクション分け(純ロジック)。
 *
 * 設計方針(UX調査の結論):
 * - マイページに出すのは「着手済み(uniqueOutfitCount>=1)または完了」だけ。
 *   未着手(0/N かつ未完了)はクラッターになるため一切出さない。
 *   → これにより神コレ等を常設(表示期間 NULL)にしても全員の 0/N で埋まらない。
 * - 「あと少し!(残り1〜2着)」を最上段の独立セクションに昇格(ゴール勾配効果)。
 * - 「進行中」は達成間近順(残り少ない順)で並べる。
 * - 完了済みは進捗リスト(進行中)からは除外し、完成台紙アルバム側で見せる。
 *
 * 看板コンプ率の分母 total は「表示可能な全シリーズ数」(= 未着手も含む raw 件数)。
 * 未着手は一覧に出さないが「全{total}中{completed}完成」のティーザーとして数だけ使う。
 */
import type { CollectionProgress } from "./collection-types";

/**
 * 残り「この値以下」を「あと少し!」に昇格させる閾値。
 * 残り0(=全着収集済みだが台紙未作成)も含めて昇格させ、台紙作成へ誘導する。
 */
export const ALMOST_DONE_REMAINING_THRESHOLD = 2;

export interface MyPageCollectionSections {
  /** あと少し!(未完了 & 残り 0〜ALMOST_DONE_REMAINING_THRESHOLD 着)。残り少ない順。 */
  almostDone: CollectionProgress[];
  /** 進行中(未完了 & 着手済み & あと少し!以外)。残り少ない順。 */
  inProgress: CollectionProgress[];
  /**
   * 看板コンプ率の分母: 表示可能な全シリーズ ∪ 完了済み(期間終了/ゲート済み台紙も含む)。
   * 分子 completedCount を必ず含むため「全N中M完成」で N < M の矛盾が起きない。
   */
  totalSeries: number;
  /**
   * 看板コンプ率の分子: 完了済みシリーズ数(progress の isCompleted ∪ 完成台紙のカテゴリ)。
   * 完成台紙アルバム(別ソース・無フィルタ)とズレないよう union で数える。
   */
  completedCount: number;
  /**
   * マイページのコレクションセクションを表示すべきか。
   * 完成台紙が無く、着手中(あと少し+進行中)も無いなら、非参加ユーザーなので丸ごと隠す。
   * (completedMounts は別propのため、呼び出し側で OR 条件に加える)
   */
  hasEngagement: boolean;
}

/** そのシリーズの残り必要数(0 未満にはしない)。 */
export function remainingOutfits(p: CollectionProgress): number {
  return Math.max(0, p.completionThreshold - p.uniqueOutfitCount);
}

function isEngagedActive(p: CollectionProgress): boolean {
  // 未完了かつ1着以上着手済み(= 未着手 0/N を除外)
  return !p.isCompleted && p.uniqueOutfitCount >= 1;
}

/** 残り少ない順。同点は着手数の多い順(より投資した順)で安定化。 */
function byRemainingThenProgress(
  a: CollectionProgress,
  b: CollectionProgress,
): number {
  const ra = remainingOutfits(a);
  const rb = remainingOutfits(b);
  if (ra !== rb) return ra - rb;
  return b.uniqueOutfitCount - a.uniqueOutfitCount;
}

export function buildMyPageCollectionSections(
  progress: readonly CollectionProgress[],
  /**
   * 完成台紙アルバム(別ソース・無フィルタ)が持つカテゴリ key。
   * 看板の completed/total を progress と union して、アルバムとの数字の矛盾を防ぐ。
   */
  completedMountCategoryKeys: readonly string[] = [],
): MyPageCollectionSections {
  // 完了カテゴリ = progress 上の isCompleted ∪ 完成台紙のカテゴリ(期間終了/ゲートで progress から消えたもの)。
  const completedKeys = new Set<string>(completedMountCategoryKeys);
  for (const p of progress) {
    if (p.isCompleted) completedKeys.add(p.categoryKey);
  }
  const completedCount = completedKeys.size;

  // 分母 = 表示可能シリーズ ∪ 完了カテゴリ(必ず completedCount を含む)。
  const allKeys = new Set<string>(completedKeys);
  for (const p of progress) allKeys.add(p.categoryKey);
  const totalSeries = allKeys.size;

  const engaged = progress.filter(isEngagedActive).sort(byRemainingThenProgress);

  // 残り0(全着収集済みだが台紙未作成)も「あと少し!」に含め、台紙作成へ誘導する。
  const almostDone = engaged.filter(
    (p) => remainingOutfits(p) <= ALMOST_DONE_REMAINING_THRESHOLD,
  );
  const almostDoneKeys = new Set(almostDone.map((p) => p.categoryKey));
  const inProgress = engaged.filter((p) => !almostDoneKeys.has(p.categoryKey));

  return {
    almostDone,
    inProgress,
    totalSeries,
    completedCount,
    hasEngagement: almostDone.length > 0 || inProgress.length > 0,
  };
}
