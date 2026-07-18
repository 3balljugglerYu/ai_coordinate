import { isActiveEventCategory } from "@/features/collections/lib/collection-display-period";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/**
 * ホーム「開催中の企画」棚のカード種別。
 * - celebration: 全コンプ後の🎉お祝いカード(プリセットを持たない)
 * - new: 解放済みで未生成(今すぐ生成できる)
 * - teaser: 次の1枚のシルエット(/style の dripLocked と同じ見せ方)
 * - done: 生成済み(✓・減光表示)
 */
export type EventShelfCardKind = "celebration" | "new" | "teaser" | "done";

export interface EventShelfCard {
  kind: EventShelfCardKind;
  /** celebration のみ null */
  preset: StylePresetPublicSummary | null;
}

export interface EventShelf {
  categoryId: string;
  categoryKey: string;
  displayNameJa: string;
  displayNameEn: string;
  /** 並び順確定済み: celebration → new → teaser → done */
  cards: EventShelfCard[];
  /** 進捗カウンター分子(distinct 生成数、分母でクランプ) */
  collectedCount: number;
  /** 進捗カウンター分母(completion_threshold)。null なら UI はカウンター非表示 */
  totalCount: number | null;
  /** 開催終了日時(カウントダウン用)。null なら無期限(カウントダウン非表示) */
  endsAt: string | null;
  isCompleted: boolean;
}

/**
 * 棚の対象となる「開催中の企画」カテゴリ key 一覧。
 * 呼び出し側はこの key に対して「生成済みプリセットID集合」を取得してから
 * deriveEventShelves に渡す(対象が無ければクエリ不要)。
 */
export function listActiveEventCategoryKeys(
  gatedPresets: readonly StylePresetPublicSummary[],
  now: Date,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const preset of gatedPresets) {
    const category = preset.category;
    if (seen.has(category.key)) continue;
    if (!isActiveEventCategory(category, now)) continue;
    seen.add(category.key);
    keys.push(category.key);
  }
  return keys;
}

/**
 * gating 適用済みプリセット一覧から「開催中の企画」棚モデルを導出する純関数。
 *
 * 入力の前提(applyCollectionUnlockGating の出力仕様):
 * - sequential カテゴリは「解放済み(昇順) + locked な次の1枚(ティザー)」のみ含まれる。
 * - 前提付き(非sequential)カテゴリは未解放も locked 付きで全て残る(ティザー複数)。
 * - 一斉公開カテゴリは gating no-op で全プリセットが unlocked のまま。
 * - 順序は sort_order 昇順のまま。
 *
 * ✓済み(done)の判定は「ユーザーが生成済みのプリセットID集合」への所属で行う。
 * 解放方式(順次/一斉/前提付き)に依存しないため、どのカテゴリでも厳密に成立する。
 * 未ログイン時は空集合を渡せば全カードが NEW(初日状態)になる。
 * 進捗カウンターは distinct 生成数(解放コンテキスト)を優先し、無ければID集合の
 * サイズで代替する(一斉公開カテゴリは解放コンテキストの集計対象外のため)。
 */
export function deriveEventShelves(
  gatedPresets: readonly StylePresetPublicSummary[],
  distinctGeneratedByCategoryKey: ReadonlyMap<string, number>,
  generatedPresetIdsByCategoryKey: ReadonlyMap<string, ReadonlySet<string>>,
  now: Date,
): EventShelf[] {
  const byCategory = new Map<string, StylePresetPublicSummary[]>();
  const categoryByKey = new Map<string, StylePresetPublicSummary["category"]>();

  for (const preset of gatedPresets) {
    const category = preset.category;
    if (!isActiveEventCategory(category, now)) {
      continue;
    }
    const list = byCategory.get(category.key);
    if (list) {
      list.push(preset);
    } else {
      byCategory.set(category.key, [preset]);
      categoryByKey.set(category.key, category);
    }
  }

  const shelves: EventShelf[] = [];
  for (const [key, presets] of byCategory) {
    const category = categoryByKey.get(key)!;
    const generatedIds =
      generatedPresetIdsByCategoryKey.get(key) ?? new Set<string>();
    const distinct = Math.max(
      0,
      distinctGeneratedByCategoryKey.get(key) ?? generatedIds.size,
    );
    const unlocked = presets.filter((p) => !p.locked);
    const teasers = presets.filter((p) => p.locked === true);

    const done = unlocked.filter((p) => generatedIds.has(p.id));
    const news = unlocked.filter((p) => !generatedIds.has(p.id));

    const totalCount = category.completionThreshold ?? null;
    const isCompleted = totalCount !== null && distinct >= totalCount;
    const collectedCount =
      totalCount !== null ? Math.min(distinct, totalCount) : distinct;

    const cards: EventShelfCard[] = [];
    if (isCompleted) {
      cards.push({ kind: "celebration", preset: null });
    }
    for (const p of news) cards.push({ kind: "new", preset: p });
    if (!isCompleted) {
      for (const p of teasers) cards.push({ kind: "teaser", preset: p });
    }
    for (const p of done) cards.push({ kind: "done", preset: p });

    if (cards.length === 0) {
      continue;
    }

    shelves.push({
      categoryId: category.id,
      categoryKey: key,
      displayNameJa: category.displayNameJa,
      displayNameEn: category.displayNameEn,
      cards,
      collectedCount,
      totalCount,
      endsAt: category.collectionDisplayEndsAt,
      isCompleted,
    });
  }

  // 終了が近い企画を先に(ends null=無期限は最後)。同値は元の並び(sort 安定性)を維持。
  shelves.sort((a, b) => {
    const ta = a.endsAt ? new Date(a.endsAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.endsAt ? new Date(b.endsAt).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  return shelves;
}

/**
 * 棚に含めた企画プリセットの id 集合。
 * 通常カルーセル側から除外して重複表示を避けるために使う。
 */
export function collectShelfPresetIds(shelves: readonly EventShelf[]): Set<string> {
  const ids = new Set<string>();
  for (const shelf of shelves) {
    for (const card of shelf.cards) {
      if (card.preset) {
        ids.add(card.preset.id);
      }
    }
  }
  return ids;
}
