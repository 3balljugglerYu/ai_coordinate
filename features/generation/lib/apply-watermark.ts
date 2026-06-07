"use client";

/**
 * 画像 Blob の右下に控えめな "Persta.AI" クレジットを焼き込んで返す。
 *
 * 用途: 未ログイン(ゲスト)のダウンロード画像にだけブランドクレジットを入れる。
 * クローゼット保存版は透かし無し(claim は元の data URL を送るため本関数を通さない)。
 * → X で拡散される画像が全てブランド入りになり(集客)、綺麗な版はログイン誘導になる。
 *
 * canvas 依存のため jsdom では実質テスト不可(既存 normalize-source-image.ts と同方針)。
 * 失敗時は元 Blob をそのまま返す(ダウンロード自体は止めない)。
 */

/**
 * 透かし焼き込み後の出力 MIME。jpeg/webp は維持し、それ以外は png に正規化する
 * (ファイル名拡張子と齟齬が出ないよう、入力タイプを尊重する)。
 */
export function watermarkOutputMime(inputType: string): string {
  if (inputType === "image/jpeg" || inputType === "image/webp") {
    return inputType;
  }
  return "image/png";
}

export async function applyPerstaWatermark(blob: Blob): Promise<Blob> {
  if (typeof document === "undefined") return blob;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return blob;
  }

  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  // 画像サイズに比例した控えめなクレジット(右下、半透明白 + 影で視認性確保)
  const fontSize = Math.max(14, Math.round(canvas.width * 0.032));
  const pad = Math.round(fontSize * 0.7);
  ctx.font = `700 ${fontSize}px sans-serif`;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.25));
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.fillText("Persta.AI", canvas.width - pad, canvas.height - pad);

  const mimeType = watermarkOutputMime(blob.type);
  const out = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined,
    );
  });
  return out ?? blob;
}
