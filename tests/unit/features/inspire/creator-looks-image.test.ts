/** @jest-environment node */

import sharp from "sharp";
import {
  processSubmissionImage,
  CREATOR_LOOKS_IMAGE_MAX_DIMENSION,
} from "@/features/inspire/lib/creator-looks-image";

/**
 * テスト用に sharp で実画像バッファを生成するヘルパ。
 * Jest 内部で sharp 自体は動くので、in-memory PNG/JPEG/WebP を作って渡す。
 */
async function makePngBuffer(
  width: number,
  height: number,
  color = { r: 200, g: 100, b: 50 },
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

async function makeJpegBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 200, b: 10 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe("processSubmissionImage", () => {
  test("有効な PNG (512x512) は WebP に再エンコードされ ok=true", async () => {
    const buf = await makePngBuffer(512, 512);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.originalFormat).toBe("png");
    expect(result.data.width).toBe(512);
    expect(result.data.height).toBe(512);
    // 出力 buffer は WebP magic byte で始まる
    const head = result.data.webpBuffer.subarray(0, 12);
    // WebP の magic: "RIFF....WEBP"
    expect(head.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(head.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  test("有効な JPEG も同様に再エンコードされる", async () => {
    const buf = await makeJpegBuffer(256, 384);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.originalFormat).toBe("jpeg");
    expect(result.data.width).toBe(256);
    expect(result.data.height).toBe(384);
  });

  test("無効なバッファ (= テキスト) は INVALID_BUFFER で reject", async () => {
    const result = await processSubmissionImage(
      Buffer.from("this is plain text, not an image"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_BUFFER");
  });

  test("空 buffer も INVALID_BUFFER で reject", async () => {
    const result = await processSubmissionImage(Buffer.alloc(0));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_BUFFER");
  });

  test("寸法上限 (4096) を超える画像は DIMENSION_TOO_LARGE で reject", async () => {
    // 4097 にすると上限 (4096) を超える
    const buf = await makePngBuffer(4097, 100);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DIMENSION_TOO_LARGE");
  });

  test("ちょうど 4096 ピクセルは valid (= 境界条件)", async () => {
    const buf = await makePngBuffer(4096, 100);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.width).toBe(4096);
  });

  test("CREATOR_LOOKS_IMAGE_MAX_DIMENSION 定数は 4096", () => {
    expect(CREATOR_LOOKS_IMAGE_MAX_DIMENSION).toBe(4096);
  });

  test("WebP 入力も valid (= 既に WebP の画像も処理可)", async () => {
    const webpBuf = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 0, g: 0, b: 200 },
      },
    })
      .webp({ quality: 80 })
      .toBuffer();
    const result = await processSubmissionImage(webpBuf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.originalFormat).toBe("webp");
  });

  test("BMP / TIFF / GIF など許可リスト外の format は FORMAT_NOT_SUPPORTED で reject", async () => {
    const gifBuf = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .gif()
      .toBuffer();
    const result = await processSubmissionImage(gifBuf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORMAT_NOT_SUPPORTED");
  });
});
