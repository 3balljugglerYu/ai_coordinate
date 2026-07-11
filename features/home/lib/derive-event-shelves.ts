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
 * 企画棚の対象カテゴリか。
 * コレクションシリーズ かつ 順次解放 かつ 表示ウィンドウがアクティブ(開始済み・未終了)。
 * starts/ends が null の側は無制限として扱う(/style の表示期間判定と同じ解釈)。
 */
function isActiveEventCategory(
  category: StylePresetPublicSummary["category"],
  now: Date,
): boolean {
  if (!category.isCollectionSeries || !category.sequentialUnlock) {
    return false;
  }
  const startsAt = category.collectionDisplayStartsAt;
  const endsAt = category.collectionDisplayEndsAt;
  if (startsAt && new Date(startsAt).getTime() > now.getTime()) {
    return false;
  }
  if (endsAt && new Date(endsAt).getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/**
 * gating 適用済みプリセット一覧から「開催中の企画」棚モデルを導出する純関数。
 *
 * 入力の前提(applyCollectionUnlockGating の出力仕様):
 * - sequential カテゴリは「解放済み(昇順) + locked な次の1枚(ティザー)」だけが含まれ、
 *   その先のプリセットは既に除去されている。
 * - 順序は sort_order 昇順のまま。
 *
 * ✓済み(done)の導出は「解放済みの先頭から distinct 生成数ぶん」。sequential 解放では
 * 順番にしか生成できない(生成が次を解放する)ため、この対応は厳密に成立する。
 * この不変条件が崩れる変更を collection-unlock 側に入れる場合はここも見直すこと。
 *
 * 追加のDBクエリは発行しない(distinct 生成数はホームで解決済みの解放コンテキストを流用)。
 */
export function deriveEventShelves(
  gatedPresets: readonly StylePresetPublicSummary[],
  distinctGeneratedByCategoryKey: ReadonlyMap<string, number>,
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
    const distinct = Math.max(
      0,
      distinctGeneratedByCategoryKey.get(key) ?? 0,
    );
    const unlocked = presets.filter((p) => !p.locked);
    const teasers = presets.filter((p) => p.locked === true);

    const doneCount = Math.min(distinct, unlocked.length);
    const done = unlocked.slice(0, doneCount);
    const news = unlocked.slice(doneCount);

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
