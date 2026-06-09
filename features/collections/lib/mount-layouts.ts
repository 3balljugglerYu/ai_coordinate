/**
 * コレクション台紙のレイアウト定義。
 *
 * 台紙テンプレ(空PNG)のスロット位置を「正規化座標(0..1)」で持ち、合成時に
 * テンプレ実寸へ換算する。これにより最終入稿アセットの解像度に依存しない。
 * 値は入稿サンプル(夏ファッションコレクション=grid_4 / トロピカル=grid_3)から
 * 概算したもの。最終アセット確定時にここを微調整するだけでよい。
 *
 * DB の preset_categories.mount_layout の CHECK と一致させること。
 */

export type MountLayoutKey = "grid_3" | "grid_4" | "grid_6";

/** テンプレ幅・高さに対する割合(0..1)で表したスロット矩形 */
export interface NormalizedSlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** sharp.composite に渡すピクセル矩形(整数) */
export interface PixelSlotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const MOUNT_LAYOUTS: Record<MountLayoutKey, NormalizedSlotRect[]> = {
  // 上段2 + 下段中央1
  grid_3: [
    { x: 0.055, y: 0.205, w: 0.42, h: 0.3 },
    { x: 0.525, y: 0.205, w: 0.42, h: 0.3 },
    { x: 0.29, y: 0.55, w: 0.42, h: 0.3 },
  ],
  // 2×2 (ウエハース「夏ファッションコレクション」テンプレ実測。アスペクト ~1:1)
  grid_4: [
    { x: 0.03, y: 0.13, w: 0.453, h: 0.405 },
    { x: 0.517, y: 0.13, w: 0.453, h: 0.405 },
    { x: 0.03, y: 0.555, w: 0.453, h: 0.395 },
    { x: 0.517, y: 0.555, w: 0.453, h: 0.395 },
  ],
  // 2列×3行
  grid_6: [
    { x: 0.055, y: 0.18, w: 0.42, h: 0.22 },
    { x: 0.525, y: 0.18, w: 0.42, h: 0.22 },
    { x: 0.055, y: 0.42, w: 0.42, h: 0.22 },
    { x: 0.525, y: 0.42, w: 0.42, h: 0.22 },
    { x: 0.055, y: 0.66, w: 0.42, h: 0.22 },
    { x: 0.525, y: 0.66, w: 0.42, h: 0.22 },
  ],
};

export function isMountLayoutKey(value: unknown): value is MountLayoutKey {
  return value === "grid_3" || value === "grid_4" || value === "grid_6";
}

/** レイアウトのスロット数(= そのレイアウトで扱えるコレクション種類数) */
export function slotCountForLayout(layout: MountLayoutKey): number {
  return MOUNT_LAYOUTS[layout].length;
}

/** レイアウトのスロット矩形配列を返す。未対応キーは例外。 */
export function getMountLayout(layout: MountLayoutKey): NormalizedSlotRect[] {
  const slots = MOUNT_LAYOUTS[layout];
  if (!slots) {
    throw new Error(`Unsupported mount layout: ${layout}`);
  }
  return slots;
}

/** 正規化矩形をテンプレ実寸のピクセル矩形へ換算する(整数に丸め) */
export function toPixelRect(
  rect: NormalizedSlotRect,
  templateWidth: number,
  templateHeight: number,
): PixelSlotRect {
  return {
    left: Math.round(rect.x * templateWidth),
    top: Math.round(rect.y * templateHeight),
    width: Math.round(rect.w * templateWidth),
    height: Math.round(rect.h * templateHeight),
  };
}
