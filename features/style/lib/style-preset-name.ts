const PRESET_NAME_MAX_CHARACTERS = 16;

/**
 * スタイルカードの1行タイトル用にプリセット名を切り詰める。
 * StylePresetPreviewCard(クライアント)と PublicStyleCard(サーバーでも描画)の
 * 両方から使うため、"use client" を付けない共有 lib に置く。
 */
export function truncateStylePresetName(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= PRESET_NAME_MAX_CHARACTERS) {
    return name;
  }
  return `${characters.slice(0, PRESET_NAME_MAX_CHARACTERS).join("")}...`;
}
