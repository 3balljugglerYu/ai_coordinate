/**
 * 台紙スロット(枠)エディタの幾何計算(純関数)。
 *
 * 編集モデル(運営確定仕様):
 * - サイズは全枠で共有(`size:{w,h}`)。どれか1枠をリサイズすると全枠が同じサイズに連動。
 * - 位置は枠ごと自由(`positions:{x,y}[]`、各枠の左上)。移動はその枠だけ動く。
 *
 * 座標はすべて正規化(0..1)。リサイズ時の「正方形維持(比率ロック)」だけは台紙実寸
 * (templateWidth/Height)を使ってピクセル空間でのアスペクトを保つ。
 *
 * 保存形式は従来どおり NormalizedSlotRect[]([{x,y,w,h}])。本モジュールの
 * split/join で「共有サイズ+位置配列」と相互変換する(ADR-004)。
 * UI から切り離した純関数なのでユニットテスト可能。
 */

import {
  MOUNT_LAYOUTS,
  type MountLayoutKey,
  type NormalizedSlotRect,
} from "@/features/collections/lib/mount-layouts";

export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** 四隅ハンドルの識別子(n=上, s=下, w=左, e=右) */
export type Corner = "nw" | "ne" | "sw" | "se";

/** エディタ内部状態: 共有サイズ + 枠ごとの左上位置 */
export interface EditorSlots {
  size: Size;
  positions: Point[];
}

export interface ResizeOptions {
  /** 比率ロック(正方形維持): ピクセル空間で現在のアスペクトを保つ */
  lockRatio: boolean;
  /** 台紙テンプレ実寸(px)。ピクセル換算・最小サイズ・比率ロックに使用 */
  templateWidth: number;
  templateHeight: number;
  /** 1枠の最小辺(px) */
  minPx: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * NormalizedSlotRect[] を「共有サイズ + 位置配列」へ分解する。
 * 共有サイズは先頭枠の w,h を採用(全枠同サイズ前提。差異があれば先頭に揃う)。
 * 空配列なら size は 0、positions も空。
 */
export function splitSlots(slots: NormalizedSlotRect[]): EditorSlots {
  if (slots.length === 0) {
    return { size: { w: 0, h: 0 }, positions: [] };
  }
  const first = slots[0];
  return {
    size: { w: first.w, h: first.h },
    positions: slots.map((s) => ({ x: s.x, y: s.y })),
  };
}

/** 「共有サイズ + 位置配列」を NormalizedSlotRect[] へ合成する(保存形式) */
export function joinSlots(state: EditorSlots): NormalizedSlotRect[] {
  return state.positions.map((p) => ({
    x: p.x,
    y: p.y,
    w: state.size.w,
    h: state.size.h,
  }));
}

/** グリッドレイアウトから初期枠を seed する(N 変更時の再 seed 用) */
export function seedSlots(layout: MountLayoutKey): NormalizedSlotRect[] {
  // 参照を共有しないようコピーを返す
  return MOUNT_LAYOUTS[layout].map((s) => ({ ...s }));
}

/** 1枠の左上位置を 0..1 内(右端/下端が共有サイズ分はみ出さない範囲)へクランプ */
export function clampPosition(pos: Point, size: Size): Point {
  return {
    x: clamp(pos.x, 0, 1 - size.w),
    y: clamp(pos.y, 0, 1 - size.h),
  };
}

/** その枠だけを移動する(共有サイズは不変)。台紙内にクランプ。 */
export function movePosition(
  pos: Point,
  size: Size,
  dxNorm: number,
  dyNorm: number,
): Point {
  return clampPosition({ x: pos.x + dxNorm, y: pos.y + dyNorm }, size);
}

/**
 * いずれかの枠の四隅ハンドルをドラッグして「共有サイズ」を変更する。
 * 対角固定: ドラッグした角の **対角を固定** したまま新サイズへ全枠が連動する
 * (例: 左上を引くと各枠の右下が固定されたままサイズが変わる)。
 * 比率ロック時はピクセル空間のアスペクトを維持。各枠はアンカー(対角)を固定したまま
 * 0..1 に収まる最大サイズへクランプする。
 */
export function resizeShared(
  state: EditorSlots,
  corner: Corner,
  dxNorm: number,
  dyNorm: number,
  opts: ResizeOptions,
): EditorSlots {
  const { size, positions } = state;
  // 動く辺の符号(東=右辺が動く/西=左辺が動く, 南=下辺が動く/北=上辺が動く)
  const sx = corner === "ne" || corner === "se" ? 1 : -1;
  const sy = corner === "sw" || corner === "se" ? 1 : -1;
  // 西(左上/左下)は左辺が動く=右辺がアンカー。北(左上/右上)は上辺が動く=下辺がアンカー。
  const isWest = corner === "nw" || corner === "sw";
  const isNorth = corner === "nw" || corner === "ne";

  let desiredW = size.w + sx * dxNorm;
  const desiredH = size.h + sy * dyNorm;

  const minW = opts.minPx / opts.templateWidth;
  const minH = opts.minPx / opts.templateHeight;

  // 各枠でアンカー(対角)を固定したまま 0..1 に収まる最大サイズ。
  // 西アンカー(右辺固定): 左辺が 0 まで → maxW = 右辺座標(x+w)
  // 東アンカー(左辺固定): 右辺が 1 まで → maxW = 1 - x
  let maxW = 1;
  let maxH = 1;
  for (const p of positions) {
    maxW = Math.min(maxW, isWest ? p.x + size.w : 1 - p.x);
    maxH = Math.min(maxH, isNorth ? p.y + size.h : 1 - p.y);
  }
  maxW = Math.max(maxW, 0);
  maxH = Math.max(maxH, 0);

  let w: number;
  let h: number;
  if (opts.lockRatio) {
    // 現在のアスペクト(h/w)を保つ。ポインタ移動の大きい軸を主軸にする。
    const ratio = size.w > 0 ? size.h / size.w : 1;
    if (Math.abs(dyNorm) > Math.abs(dxNorm)) {
      desiredW = ratio > 0 ? desiredH / ratio : desiredW;
    }
    const lowW = Math.max(minW, minH / (ratio || 1));
    const highW = Math.min(maxW, ratio > 0 ? maxH / ratio : maxW);
    w = clamp(desiredW, lowW, highW);
    h = w * ratio;
  } else {
    w = clamp(desiredW, minW, maxW);
    h = clamp(desiredH, minH, maxH);
  }

  // 各枠はアンカー(対角)を固定したまま新サイズへ。
  // 西アンカーなら右辺(x+size.w)を保つ → x = (x+size.w) - w
  // 北アンカーなら下辺(y+size.h)を保つ → y = (y+size.h) - h
  const newPositions = positions.map((p) => ({
    x: isWest ? p.x + size.w - w : p.x,
    y: isNorth ? p.y + size.h - h : p.y,
  }));
  return { size: { w, h }, positions: newPositions };
}

/** 共有サイズのピクセル比 (w_px / h_px) を返す。生成側の比率(3:4 等)と同じ尺度。 */
export function pixelAspectRatio(
  size: Size,
  templateWidth: number,
  templateHeight: number,
): number {
  const wPx = size.w * templateWidth;
  const hPx = size.h * templateHeight;
  return hPx > 0 ? wPx / hPx : 1;
}

/**
 * 共有サイズを指定の **ピクセル比(ratioPx = w_px / h_px)** にそろえる。
 * 例: ratioPx = 3/4 で枠を 3:4(縦長) に。生成の GEMINI_SUPPORTED_ASPECT_RATIOS と
 * 同じ尺度。各枠は左上(位置)を保ったまま幅基準で高さを決め、はみ出す場合は比率を
 * 保ったまま全枠が 0..1 に収まる最大サイズへ縮める。最小サイズも比率を保って適用。
 */
export function applyAspect(
  state: EditorSlots,
  ratioPx: number,
  templateWidth: number,
  templateHeight: number,
  minPx: number,
): EditorSlots {
  const { size, positions } = state;
  if (positions.length === 0 || ratioPx <= 0) {
    return state;
  }
  // 左上固定で各枠が収まる上限(幅/高さ)
  let maxW = 1;
  let maxH = 1;
  for (const p of positions) {
    maxW = Math.min(maxW, 1 - p.x);
    maxH = Math.min(maxH, 1 - p.y);
  }
  const minW = minPx / templateWidth;
  const minH = minPx / templateHeight;

  // ピクセル比 R = (w*tW)/(h*tH) より h = w*tW/(R*tH), w = h*R*tH/tW
  const hFromW = (w: number) => (w * templateWidth) / (ratioPx * templateHeight);
  const wFromH = (h: number) => (h * ratioPx * templateHeight) / templateWidth;

  // 現在の幅を起点に、比率を保ったまま max/min に収める
  let w = size.w;
  let h = hFromW(w);
  if (h > maxH) {
    h = maxH;
    w = wFromH(h);
  }
  if (w > maxW) {
    w = maxW;
    h = hFromW(w);
  }
  if (w < minW) {
    w = minW;
    h = hFromW(w);
  }
  if (h < minH) {
    h = minH;
    w = wFromH(h);
  }
  // 最小が最大を超える極端なケースの安全クランプ(比率は崩れうる)
  w = Math.min(w, maxW);
  h = Math.min(h, maxH);

  // 左上は保持(位置不変)
  return { size: { w, h }, positions: positions.map((p) => ({ ...p })) };
}
