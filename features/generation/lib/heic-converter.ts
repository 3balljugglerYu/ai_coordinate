/**
 * HEIC/HEIF画像変換機能
 * heic-convertライブラリを使用してHEIC/HEIF→JPEG/PNG変換を行う
 */

import convert from "heic-convert";

/**
 * HEIC/HEIF画像をJPEG形式に変換
 * @param heicBuffer HEIC/HEIF画像のBuffer
 * @param quality JPEG品質（0-1、デフォルト: 0.9）
 * @returns JPEG形式のBuffer
 */
export async function convertHeicToJpeg(
  heicBuffer: Buffer,
  quality: number = 0.9
): Promise<Buffer> {
  const outputBuffer = await convert({
    buffer: heicBuffer,
    format: "JPEG",
    quality,
  });

  return Buffer.from(outputBuffer);
}

/**
 * HEIC/HEIF画像をPNG形式に変換
 * @param heicBuffer HEIC/HEIF画像のBuffer
 * @returns PNG形式のBuffer
 */
export async function convertHeicToPng(heicBuffer: Buffer): Promise<Buffer> {
  const outputBuffer = await convert({
    buffer: heicBuffer,
    format: "PNG",
  });

  return Buffer.from(outputBuffer);
}

/**
 * Base64エンコードされたHEIC/HEIF画像をJPEG形式のBase64に変換
 * @param heicBase64 HEIC/HEIF画像のBase64文字列（data:プレフィックスなし）
 * @param quality JPEG品質（0-1、デフォルト: 0.9）
 * @returns { base64: JPEG形式のBase64文字列, mimeType: "image/jpeg" }
 */
export async function convertHeicBase64ToJpeg(
  heicBase64: string,
  quality: number = 0.9
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  // Base64をBufferに変換
  const heicBuffer = Buffer.from(heicBase64, "base64");

  // HEIC/HEIFをJPEGに変換
  const jpegBuffer = await convertHeicToJpeg(heicBuffer, quality);

  // BufferをBase64に変換
  const jpegBase64 = jpegBuffer.toString("base64");

  return {
    base64: jpegBase64,
    mimeType: "image/jpeg",
  };
}

/**
 * Base64エンコードされたHEIC/HEIF画像をPNG形式のBase64に変換
 * @param heicBase64 HEIC/HEIF画像のBase64文字列（data:プレフィックスなし）
 * @returns { base64: PNG形式のBase64文字列, mimeType: "image/png" }
 */
export async function convertHeicBase64ToPng(
  heicBase64: string
): Promise<{ base64: string; mimeType: "image/png" }> {
  // Base64をBufferに変換
  const heicBuffer = Buffer.from(heicBase64, "base64");

  // HEIC/HEIFをPNGに変換
  const pngBuffer = await convertHeicToPng(heicBuffer);

  // BufferをBase64に変換
  const pngBase64 = pngBuffer.toString("base64");

  return {
    base64: pngBase64,
    mimeType: "image/png",
  };
}

/**
 * HEIC/HEIF画像かどうかを判定
 * @param mimeType MIMEタイプ
 * @returns HEIC/HEIF画像の場合true
 */
export function isHeicImage(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().trim();
  return normalized === "image/heic" || normalized === "image/heif";
}
