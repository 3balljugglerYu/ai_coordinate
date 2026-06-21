/**
 * コレクション図鑑(/collections)の表示用ビューを純ロジックで組み立てる。
 * カタログ(匿名メタ)とユーザー進捗をマージし、状態(未着手/進行中/完成)を付けて並べ替える。
 *
 * - 解放ゲート(unlock_prerequisite_key)が未達のシリーズは図鑑から除外する
 *   (/style・マイページと同じポリシー。匿名は前提未完走として除外)。
 * - 並び順は「進行中 → 未着手 → 完成」(集めたくなる順)。同状態はカタログ順(displayOrder)を維持。
 */
import type { CollectionCatalogItem } from "./collection-catalog-repository";
import type { CollectionProgress } from "./collection-types";

export type CollectionCatalogState =
  | "completed"
  | "in_progress"
  | "not_started";

export interface CollectionCatalogEntry {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  imageUrl: string | null;
  completionThreshold: number;
  uniqueOutfitCount: number;
  remaining: number;
  state: CollectionCatalogState;
}

function stateRank(s: CollectionCatalogState): number {
  return s === "in_progress" ? 0 : s === "not_started" ? 1 : 2;
}

export function buildCollectionCatalogView(
  catalog: readonly CollectionCatalogItem[],
  progress: readonly CollectionProgress[],
): CollectionCatalogEntry[] {
  const progressByKey = new Map(progress.map((p) => [p.categoryKey, p]));
  const completedKeys = new Set(
    progress.filter((p) => p.isCompleted).map((p) => p.categoryKey),
  );

  return catalog
    .filter((item) => {
      // 解放ゲート: 前提カテゴリ未完走なら図鑑に出さない。
      if (!item.unlockPrerequisiteKey) return true;
      return completedKeys.has(item.unlockPrerequisiteKey);
    })
    .map((item) => {
      const p = progressByKey.get(item.key);
      const uniqueOutfitCount = p?.uniqueOutfitCount ?? 0;
      const isCompleted = p?.isCompleted ?? false;
      const remaining = Math.max(
        0,
        item.completionThreshold - uniqueOutfitCount,
      );
      const state: CollectionCatalogState = isCompleted
        ? "completed"
        : uniqueOutfitCount > 0
          ? "in_progress"
          : "not_started";
      return {
        key: item.key,
        displayNameJa: item.displayNameJa,
        displayNameEn: item.displayNameEn,
        imageUrl: item.characterImageUrl ?? item.mountTemplateUrl,
        completionThreshold: item.completionThreshold,
        uniqueOutfitCount,
        remaining,
        state,
      };
    })
    .sort((a, b) => stateRank(a.state) - stateRank(b.state));
}
