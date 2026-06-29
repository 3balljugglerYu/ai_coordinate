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

/** 開催状況: 集められる / 終了(復刻待ち) / 近日(開始前)。 */
export type CollectionCatalogAvailability = "available" | "ended" | "upcoming";

export interface CollectionCatalogEntry {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  imageUrl: string | null;
  completionThreshold: number;
  uniqueOutfitCount: number;
  remaining: number;
  state: CollectionCatalogState;
  availability: CollectionCatalogAvailability;
  /** 完成台紙(コンプリートモーダル表示用)。未完成は null。 */
  completionId: string | null;
  /** 完走表示モード(mount=台紙 / book=本)。シェア導線の遷移先分岐に使う。 */
  completionViewMode: "mount" | "book";
  mountImagePath: string | null;
  mountTemplateWidth: number | null;
  mountTemplateHeight: number | null;
}

/** 表示期間 [starts, ends) に対する now の開催状況を返す。null は制限なし=available。 */
function computeAvailability(
  startsAt: string | null,
  endsAt: string | null,
  now: Date,
): CollectionCatalogAvailability {
  if (startsAt) {
    const s = new Date(startsAt);
    if (!Number.isNaN(s.getTime()) && now < s) return "upcoming";
  }
  if (endsAt) {
    const e = new Date(endsAt);
    if (!Number.isNaN(e.getTime()) && now >= e) return "ended";
  }
  return "available";
}

/**
 * 並び順: 集める導線が活きるものを上に。
 * 進行中 → 未着手(開催中) → 近日 → 終了 → 完成。
 */
function entryRank(entry: CollectionCatalogEntry): number {
  if (entry.state === "completed") return 4;
  if (entry.availability === "ended") return 3;
  if (entry.availability === "upcoming") return 2;
  if (entry.state === "in_progress") return 0;
  return 1; // 開催中の未着手
}

export function buildCollectionCatalogView(
  catalog: readonly CollectionCatalogItem[],
  progress: readonly CollectionProgress[],
  now: Date = new Date(),
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
      let state: CollectionCatalogState = "not_started";
      if (isCompleted) {
        state = "completed";
      } else if (uniqueOutfitCount > 0) {
        state = "in_progress";
      }
      const availability = computeAvailability(
        item.collectionDisplayStartsAt,
        item.collectionDisplayEndsAt,
        now,
      );
      return {
        key: item.key,
        displayNameJa: item.displayNameJa,
        displayNameEn: item.displayNameEn,
        imageUrl: item.characterImageUrl ?? item.mountTemplateUrl,
        completionThreshold: item.completionThreshold,
        uniqueOutfitCount,
        remaining,
        state,
        availability,
        completionId: p?.completionId ?? null,
        completionViewMode: p?.completionViewMode ?? "mount",
        mountImagePath: p?.mountImagePath ?? null,
        mountTemplateWidth: p?.mountTemplateWidth ?? null,
        mountTemplateHeight: p?.mountTemplateHeight ?? null,
      };
    })
    .sort((a, b) => entryRank(a) - entryRank(b));
}
