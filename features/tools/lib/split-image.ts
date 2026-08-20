/**
 * 画像分割ツールの切り出しロジック。
 *
 * **すべてブラウザ内で完結する**(サーバーへは一切送らない)。
 * - 原価ゼロ(AI もストレージも使わない)
 * - Vercel の 4.5MB ボディ制限と無関係(そもそも POST しない)
 * - 「画像はアップロードされません」とプライバシー訴求できる
 *
 * X の複数枚投稿はタイムラインで 2×2 グリッドに畳まれるが、タップして
 * スワイプすると1枚ずつ表示される。16:9 を縦4分割して順に投稿すると、
 * スワイプでパノラマがつながって見える——というのが流行の形。
 */

export type SplitMode = "vertical4" | "horizontal4" | "grid4";

export interface SplitPiece {
  blob: Blob;
  /** X に投稿する順。1 始まり(左→右、2×2 は 左上→右上→左下→右下) */
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

/**
 * 分割の矩形を計算する。端数は最後の行・列に寄せる
 * (4等分できない幅で 1px の隙間や重複を作らないため)。
 */
export function computeSplitRects(
  width: number,
  height: number,
  mode: SplitMode,
): SplitRect[] {
  if (mode === "vertical4") {
    const base = Math.floor(width / 4);
    return [0, 1, 2, 3].map((i) => ({
      x: base * i,
      y: 0,
      // 最後の1枚が余りを引き受ける
      w: i === 3 ? width - base * 3 : base,
      h: height,
    }));
  }
  if (mode === "horizontal4") {
    // 縦長画像を横に4分割(上→下)。縦4分割の転置
    const base = Math.floor(height / 4);
    return [0, 1, 2, 3].map((i) => ({
      x: 0,
      y: base * i,
      w: width,
      h: i === 3 ? height - base * 3 : base,
    }));
  }
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

/**
 * 画像ファイルを分割して PNG の Blob 配列を返す。
 *
 * `createImageBitmap` の `imageOrientation: "from-image"` で EXIF の回転を
 * 反映してから切る(スマホ撮影画像が横倒しのまま分割されるのを防ぐ)。
 */
export async function splitImageFile(
  file: File | Blob,
  mode: SplitMode,
): Promise<SplitPiece[]> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const rects = computeSplitRects(bitmap.width, bitmap.height, mode);
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
