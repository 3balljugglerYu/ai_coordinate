import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/** 「✨新着」チップの対象窓(日)。 */
export const STYLE_NEW_WINDOW_DAYS = 14;

/** 探索シートのチップ識別子。カテゴリは "category:<key>"。 */
export type StyleBrowseChipId =
  | "all"
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
 * 並び: すべて → お気に入り(ログイン時) → 新着 → 人気 → クリエイター → カテゴリ別。
 */
export function deriveStyleBrowseChips(
  presets: readonly StylePresetPublicSummary[],
  context: StyleBrowseContext,
): StyleBrowseChip[] {
  const chips: StyleBrowseChip[] = [{ id: "all" }];
  if (context.isAuthenticated) {
    chips.push({ id: "favorites" });
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
    if (!seen.has(key)) {
      seen.set(key, {
        id: `category:${key}`,
        categoryLabelJa: preset.category.displayNameJa,
        categoryLabelEn: preset.category.displayNameEn,
      });
    }
  }
  if (seen.size >= 2) {
    chips.push(...seen.values());
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
      return presets.filter((p) => p.category.key === key);
    }
  }
}
