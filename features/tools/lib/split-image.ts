/**
 * 画像分割ツールの切り出しロジック。
 *
 * **すべてブラウザ内で完結する**(サーバーへは一切送らない)。
 * - 原価ゼロ(AI もストレージも使わない)
 * - Vercel の 4.5MB ボディ制限と無関係(そもそも POST しない)
 * - 「画像はアップロードされません」とプライバシー訴求できる
 *
 * 分割数は 2/3/4 に対応する。**4分割だけは X で特別な見え方をする**:
 * 複数枚投稿はタイムラインで 2×2 グリッドに畳まれ、タップしてスワイプすると
 * 1枚ずつ表示される。16:9 を縦4分割して順に投稿するとパノラマがつながって
 * 見える——というのが流行の形。2枚・3枚では並び方が違うので、
 * この案内を出すのは4枚のときだけにすること。
 */

import {
  createEqualBoundaries,
  toBoundaryList,
  type SplitBoundaries,
} from "./split-boundaries";

export type SplitAxis = "vertical" | "horizontal";

/** 対応する分割数。増やすときは UI の grid クラス表も一緒に増やすこと。 */
export type SplitCount = 2 | 3 | 4;

export const SPLIT_COUNTS: readonly SplitCount[] = [2, 3, 4];

/**
 * 分割方法。`vertical3` = 縦に3分割(縦の切れ目で左→右)。
 * `grid4` だけは軸を持たない特別扱い。
 */
export type SplitMode = `${SplitAxis}${SplitCount}` | "grid4";

export interface SplitPiece {
  blob: Blob;
  /** X に投稿する順。1 始まり(左→右 / 上→下、2×2 は 左上→右上→左下→右下) */
  index: number;
  width: number;
  height: number;
}

interface SplitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `vertical3` → `{ axis: "vertical", count: 3 }`。`grid4` は null。 */
export function parseSplitMode(
  mode: SplitMode,
): { axis: SplitAxis; count: SplitCount } | null {
  const matched = /^(vertical|horizontal)([234])$/.exec(mode);
  if (!matched) return null;
  return {
    axis: matched[1] as SplitAxis,
    count: Number(matched[2]) as SplitCount,
  };
}

/** その分割方法で何枚に分かれるか。文言・ボタンの「N枚」に使う。 */
export function splitPieceCount(mode: SplitMode): number {
  return parseSplitMode(mode)?.count ?? 4;
}

/** `vertical` / `horizontal` / `grid` を組み立てる。 */
export function buildSplitMode(axis: SplitAxis, count: SplitCount): SplitMode {
  return `${axis}${count}` as SplitMode;
}

/**
 * 分割の矩形を計算する。
 *
 * `boundaries` を渡すと、その位置で切る(端を詰めればトリミングになる)。
 * 省略時は全体を等分する従来どおりの動き。
 *
 * **隣り合う断片は必ず接する。** 各断片の開始位置を前の断片の終わりに
 * 揃えることで、丸め誤差で 1px の隙間(黒い線)や重複が出ないようにする。
 */
export function computeSplitRects(
  width: number,
  height: number,
  mode: SplitMode,
  boundaries?: SplitBoundaries,
): SplitRect[] {
  if (mode === "grid4") {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    // 左上 → 右上 → 左下 → 右下(X の 2×2 の並びと同じ)
    return [
      { x: 0, y: 0, w: halfW, h: halfH },
      { x: halfW, y: 0, w: width - halfW, h: halfH },
      { x: 0, y: halfH, w: halfW, h: height - halfH },
      { x: halfW, y: halfH, w: width - halfW, h: height - halfH },
    ];
  }

  const parsed = parseSplitMode(mode);
  if (!parsed) {
    /*
      型で防いでいるので通常は到達しない。黙って別の分割に倒すと
      「選んだ枚数と違うものが保存される」ので、必ず失敗させる。
    */
    throw new Error(`UNKNOWN_SPLIT_MODE: ${mode}`);
  }

  const { axis, count } = parsed;
  const total = axis === "vertical" ? width : height;
  const list = toBoundaryList(boundaries ?? createEqualBoundaries(count));

  /*
    比率 → px。四捨五入したうえで、次の断片は前の終わりから始める。
    個別に round すると隣どうしが 1px ずれて隙間や重なりになる。
  */
  const edges = list.map((ratio) => Math.round(ratio * total));

  return Array.from({ length: count }, (_, i) => {
    const from = edges[i];
    const to = edges[i + 1];
    // 丸めで潰れても 1px は残す(0 幅の canvas は例外になる)
    const size = Math.max(1, to - from);
    return axis === "vertical"
      ? { x: from, y: 0, w: size, h: height }
      : { x: 0, y: from, w: width, h: size };
  });
}

/**
 * 画像ファイルを分割して PNG の Blob 配列を返す。
 *
 * `createImageBitmap` の `imageOrientation: "from-image"` で EXIF の回転を
 * 反映してから切る(スマホ撮影画像が横倒しのまま分割されるのを防ぐ)。
 */
export async function splitImageFile(
  file: File | Blob,
  mode: SplitMode,
  boundaries?: SplitBoundaries,
): Promise<SplitPiece[]> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const rects = computeSplitRects(
      bitmap.width,
      bitmap.height,
      mode,
      boundaries,
    );
    const pieces: SplitPiece[] = [];
    for (const [i, rect] of rects.entries()) {
      const canvas = document.createElement("canvas");
      canvas.width = rect.w;
      canvas.height = rect.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
      ctx.drawImage(
        bitmap,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        0,
        0,
        rect.w,
        rect.h,
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("TO_BLOB_FAILED"))),
          "image/png",
        );
      });
      pieces.push({ blob, index: i + 1, width: rect.w, height: rect.h });
    }
    return pieces;
  } finally {
    bitmap.close();
  }
}

/** 保存ファイル名。`photo.jpg` → `photo_1.png`。 */
export function pieceFileName(originalName: string, index: number): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  return `${base}_${index}.png`;
}
