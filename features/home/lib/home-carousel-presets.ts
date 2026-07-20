import { STYLE_NEW_WINDOW_DAYS } from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

/**
 * ホームのお着替えカルーセルに出す最大枚数。全件(120枚超×ループ用3複製)を
 * 並べるとホーム初回表示の DOM/ハイドレーションが重くなるため上位のみに絞る。
 * 全件の探索は「すべて見る」(探索シート)が担う。
 */
export const CAROUSEL_MAX_ITEMS = 20;

/** カルーセル先頭に固定で出す「新着」の最大枚数(残り = 人気枠 13枚)。 */
export const CAROUSEL_MAX_NEW_ITEMS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 新着(登録から STYLE_NEW_WINDOW_DAYS 日以内)か。NEW バッジ表示にも使う。 */
export function isNewPreset(
  preset: StylePresetPublicSummary,
  now: Date,
): boolean {
  const created = Date.parse(preset.createdAt);
  if (Number.isNaN(created)) return false;
  return now.getTime() - created <= STYLE_NEW_WINDOW_DAYS * DAY_MS;
}

/**
 * カルーセル表示用のプリセットを導出する。
 *
 * 並び: 新着(直近 STYLE_NEW_WINDOW_DAYS 日・作成日の新しい順)を先頭に最大
 * CAROUSEL_MAX_NEW_ITEMS 枚 → 残りを人気(直近30日生成数の降順)で埋めて合計
 * CAROUSEL_MAX_ITEMS 枚。人気順だけだと登録直後のスタイル(生成数0)が
 * ホームに一切露出しないため、新着枠を先頭に確保する。
 * 新着窓は探索シートの「✨新着」チップ(STYLE_NEW_WINDOW_DAYS)と共有する。
 *
 * sort は安定なので、人気同数(未生成含む)は入力の並び順(sort_order)を維持する。
 * generateCounts が空(集計失敗時のフォールバック)でも新着→既存順で成立する。
 */
export function deriveHomeCarouselPresets(
  presets: readonly StylePresetPublicSummary[],
  generateCounts: Readonly<Record<string, number>>,
  now: Date,
): StylePresetPublicSummary[] {
  const newest = presets
    .filter((preset) => isNewPreset(preset, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, CAROUSEL_MAX_NEW_ITEMS);
  const newestIds = new Set(newest.map((preset) => preset.id));
  const popular = presets
    .filter((preset) => !newestIds.has(preset.id))
    .sort(
      (a, b) => (generateCounts[b.id] ?? 0) - (generateCounts[a.id] ?? 0),
    );
  return [...newest, ...popular].slice(0, CAROUSEL_MAX_ITEMS);
}
