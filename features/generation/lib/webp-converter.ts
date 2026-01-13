/**
 * WebP画像変換機能
 * Sharpライブラリを使用してPNG/JPEG→WebP変換を行う
 */

import sharp from "sharp";

const STORAGE_BUCKET = "generated-images";

/**
 * 画像をWebP形式に変換し、指定サイズにリサイズ
 * @param imageBuffer 元画像のBuffer
 * @param options 変換オプション
 * @returns WebP形式のBuffer
 */
export async function convertToWebP(
  imageBuffer: Buffer,
  options: {
    maxWidth?: number; // 最大幅（px）
    maxHeight?: number; // 最大高さ（px）
    quality?: number; // WebP品質（1-100、デフォルト: 80）
  } = {}
): Promise<Buffer> {
  const { maxWidth, maxHeight, quality = 80 } = options;

  let pipeline = sharp(imageBuffer);

  // リサイズが必要な場合
  if (maxWidth || maxHeight) {
    pipeline = pipeline.resize(maxWidth, maxHeight, {
      fit: "inside", // アスペクト比を維持しながら、指定サイズ内に収める
      withoutEnlargement: true, // 拡大しない（縮小のみ）
    });
  }

  // WebP形式に変換
  return pipeline.webp({ quality }).toBuffer();
}

/**
 * 画像URLからWebP形式のサムネイルを生成（幅640px固定）
 * @param imageUrl 元画像のURL
 * @returns WebP形式のBuffer（幅640px固定）
 */
export async function generateThumbnailWebP(imageUrl: string): Promise<Buffer> {
  // 画像をダウンロード
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  // WebP形式のサムネイルを生成（幅640px固定）
  return convertToWebP(imageBuffer, {
    maxWidth: 640,
    quality: 80,
  });
}

/**
 * 画像URLからWebP形式の表示用画像を生成（長辺1280px固定）
 * @param imageUrl 元画像のURL
 * @returns WebP形式のBuffer（長辺1280px固定）
 */
export async function generateDisplayWebP(imageUrl: string): Promise<Buffer> {
  // 画像をダウンロード
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`画像の取得に失敗しました: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  // 画像のメタデータを取得して、アスペクト比を確認
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  if (!width || !height) {
    throw new Error("画像のメタデータが取得できませんでした");
  }

  // 長辺を1280pxに調整
  const maxDimension = 1280;
  let targetWidth: number | undefined;
  let targetHeight: number | undefined;

  if (width > height) {
    // 横長の場合
    targetWidth = maxDimension;
    targetHeight = undefined; // アスペクト比を維持
  } else {
    // 縦長の場合
    targetWidth = undefined; // アスペクト比を維持
    targetHeight = maxDimension;
  }

  // WebP形式の表示用画像を生成
  return convertToWebP(imageBuffer, {
    maxWidth: targetWidth,
    maxHeight: targetHeight,
    quality: 85, // 表示用は少し高品質に
  });
}
