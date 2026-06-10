/**
 * 台紙画像の表示用アスペクト比(カテゴリ別)。
 *
 * 台紙は object-cover で表示するため、コンテナの縦横比が実画像とずれると
 * 上下(または左右)がクロップされる。MODAL_LAYOUTS と同様に、最終入稿
 * アセットの実寸からカテゴリキーで静的に定義する。
 * 未登録カテゴリは 4枠版テンプレ相当の 525/612 にフォールバック。
 */

export const DEFAULT_MOUNT_ASPECT = "525 / 612";

const MOUNT_ASPECTS: Record<string, string> = {
  // うちの子の神コレクション(6枠): テンプレ 1024x1608
  collectible_wafer_sticker_god_6p: "1024 / 1608",
};

export function mountAspectForCategory(categoryKey: string): string {
  return MOUNT_ASPECTS[categoryKey] ?? DEFAULT_MOUNT_ASPECT;
}
