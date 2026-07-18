import { isActiveEventCategory } from "@/features/collections/lib/collection-display-period";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/** 「✨新着」チップの対象窓(日)。 */
export const STYLE_NEW_WINDOW_DAYS = 14;

/**
 * カテゴリチップを出さないカテゴリ key。
 * - coordinate_2 (コーディネート2.0): 独立タブにせず「コーディネート」チップに集約する
 *   (STYLE_CATEGORY_CHIP_MERGED_KEYS 参照)
 * - kotowaza_dictionary (ことわざ辞典 上巻): 開催中企画は「🎉イベント」チップに集約する
 * いずれもプリセット自体は「すべて」等には出る。
 */
export const STYLE_HIDDEN_CATEGORY_CHIP_KEYS: ReadonlySet<string> = new Set([
  "coordinate_2",
  "kotowaza_dictionary",
]);

/**
 * カテゴリチップの末尾固定順。ここに挙げた key はチップ列の最後にこの並びで置く。
 * それ以外のカテゴリはプリセットの出現順のまま、この並びの前に置く。
 */
export const STYLE_CATEGORY_CHIP_TAIL_ORDER: readonly string[] = [
  "character_remix", // アレンジ
  "character_coordinate", // テイスト
  "coordinate", // コーディネート
];

/**
 * カテゴリチップ key -> 追加で含めるカテゴリ key。
 * 派生カテゴリを親チップに集約する(派生側は STYLE_HIDDEN_CATEGORY_CHIP_KEYS で
 * チップ自体を出さない)。
 */
export const STYLE_CATEGORY_CHIP_MERGED_KEYS: Readonly<
  Record<string, readonly string[]>
> = {
  coordinate: ["coordinate_2"],
};

/** 探索シートのチップ識別子。カテゴリは "category:<key>"。 */
export type StyleBrowseChipId =
  | "all"
  | "event"
  | "favorites"
  | "new"
  | "popular"
  | "creator"
  | `category:${string}`;

export interface StyleBrowseChip {
  id: StyleBrowseChipId;
  /** カテゴリチップのみ: 表示ラベル(displayName)。それ以外は i18n キーで解決する。 */
  categoryLabelJa?: string;
  categoryLabelEn?: string;
}

export interface StyleBrowseContext {
  favoriteIds: ReadonlySet<string>;
  /** プリセットID -> 直近生成数(人気)。空なら人気チップ非表示。 */
  generateCounts: Readonly<Record<string, number>>;
  now: Date;
  isAuthenticated: boolean;
}

function isNewPreset(preset: StylePresetPublicSummary, now: Date): boolean {
  const created = Date.parse(preset.createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= STYLE_NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function hasCreator(preset: StylePresetPublicSummary): boolean {
  return Boolean(preset.providerUserId ?? preset.category.providerUserId);
}

/**
 * presets から表示すべきチップ列を導出する(空になる軸のチップは出さない)。
 * 並び: すべて → お気に入り(ログイン時) → イベント(開催中のみ) → 新着 → 人気 → クリエイター → カテゴリ別。
 */
export function deriveStyleBrowseChips(
  presets: readonly StylePresetPublicSummary[],
  context: StyleBrowseContext,
): StyleBrowseChip[] {
  const chips: StyleBrowseChip[] = [{ id: "all" }];
  if (context.isAuthenticated) {
    chips.push({ id: "favorites" });
  }
  if (presets.some((p) => isActiveEventCategory(p.category, context.now))) {
    chips.push({ id: "event" });
  }
  if (presets.some((p) => isNewPreset(p, context.now))) {
    chips.push({ id: "new" });
  }
  if (presets.some((p) => (context.generateCounts[p.id] ?? 0) > 0)) {
    chips.push({ id: "popular" });
  }
  if (presets.some(hasCreator)) {
    chips.push({ id: "creator" });
  }
  // カテゴリチップ: 出現順で重複排除。カテゴリが1種類しか無ければ「すべて」と同義なので出さない。
  const seen = new Map<string, StyleBrowseChip>();
  for (const preset of presets) {
    const key = preset.category.key;
    if (STYLE_HIDDEN_CATEGORY_CHIP_KEYS.has(key)) {
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, {
        id: `category:${key}`,
        categoryLabelJa: preset.category.displayNameJa,
        categoryLabelEn: preset.category.displayNameEn,
      });
    }
  }
  if (seen.size >= 2) {
    // 末尾固定順(STYLE_CATEGORY_CHIP_TAIL_ORDER)の対象は最後にその並びで置き、
    // それ以外(企画カテゴリ等)は出現順のまま前に置く。
    const headChips = [...seen.entries()]
      .filter(([key]) => !STYLE_CATEGORY_CHIP_TAIL_ORDER.includes(key))
      .map(([, chip]) => chip);
    const tailChips = STYLE_CATEGORY_CHIP_TAIL_ORDER.filter((key) =>
      seen.has(key),
    ).map((key) => seen.get(key)!);
    chips.push(...headChips, ...tailChips);
  }
  return chips;
}

/**
 * チップに応じて presets を絞り込む(popular のみ生成数降順に並び替え)。
 * locked(シルエット)も現行ストリップ同様に残す(選択不可はカード側が担保)。
 */
export function filterStyleBrowsePresets(
  presets: readonly StylePresetPublicSummary[],
  chipId: StyleBrowseChipId,
  context: StyleBrowseContext,
): StylePresetPublicSummary[] {
  switch (chipId) {
    case "all":
      return [...presets];
    case "event":
      return presets.filter((p) =>
        isActiveEventCategory(p.category, context.now),
      );
    case "favorites":
      return presets.filter((p) => context.favoriteIds.has(p.id));
    case "new":
      return presets.filter((p) => isNewPreset(p, context.now));
    case "popular": {
      const counted = presets.filter(
        (p) => (context.generateCounts[p.id] ?? 0) > 0,
      );
      // 安定ソート: 同数は元の並びを維持。
      return counted.sort(
        (a, b) =>
          (context.generateCounts[b.id] ?? 0) -
          (context.generateCounts[a.id] ?? 0),
      );
    }
    case "creator":
      return presets.filter(hasCreator);
    default: {
      const key = chipId.slice("category:".length);
      const keys = new Set([
        key,
        ...(STYLE_CATEGORY_CHIP_MERGED_KEYS[key] ?? []),
      ]);
      return presets.filter((p) => keys.has(p.category.key));
    }
  }
}
