/** @jest-environment node */

import sharp from "sharp";
import {
  processSubmissionImage,
  CREATOR_LOOKS_IMAGE_MAX_DIMENSION,
  CREATOR_LOOKS_IMAGE_MIN_DIMENSION,
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
  test("有効な PNG (768x768) は WebP に再エンコードされ ok=true", async () => {
    const buf = await makePngBuffer(768, 768);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.originalFormat).toBe("png");
    expect(result.data.width).toBe(768);
    expect(result.data.height).toBe(768);
    // 出力 buffer は WebP magic byte で始まる
    const head = result.data.webpBuffer.subarray(0, 12);
    // WebP の magic: "RIFF....WEBP"
    expect(head.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(head.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  test("有効な JPEG も同様に再エンコードされる", async () => {
    const buf = await makeJpegBuffer(800, 900);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.originalFormat).toBe("jpeg");
    expect(result.data.width).toBe(800);
    expect(result.data.height).toBe(900);
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
    // 4097 にすると上限 (4096) を超える。高さは下限 (768) 以上にして上限判定が先に出ることを保証
    const buf = await makePngBuffer(4097, 800);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DIMENSION_TOO_LARGE");
  });

  test("上限超過と下限未満を同時に満たす場合は MAX 判定を優先 (4097x500 → DIMENSION_TOO_LARGE)", async () => {
    // 幅 4097 (>4096) かつ 高さ 500 (<768)。検証順 (MAX→MIN) を pin する
    const buf = await makePngBuffer(4097, 500);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DIMENSION_TOO_LARGE");
  });

  test("ちょうど 4096 ピクセルは valid (= 上限境界条件)", async () => {
    const buf = await makePngBuffer(4096, 768);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.width).toBe(4096);
  });

  test("CREATOR_LOOKS_IMAGE_MAX_DIMENSION 定数は 4096", () => {
    expect(CREATOR_LOOKS_IMAGE_MAX_DIMENSION).toBe(4096);
  });

  test("寸法下限 (768) 未満の画像は DIMENSION_TOO_SMALL で reject", async () => {
    // 両辺とも 768 未満 → 低解像度なので生成品質を落とす
    const buf = await makePngBuffer(500, 500);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DIMENSION_TOO_SMALL");
  });

  test("片辺だけ 768 未満 (767x768) でも DIMENSION_TOO_SMALL で reject", async () => {
    // 超縦長/横長の素材対策: 片方でも 768 未満なら reject
    const buf = await makePngBuffer(767, 768);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DIMENSION_TOO_SMALL");
  });

  test("ちょうど 768 ピクセルは valid (= 下限境界条件)", async () => {
    const buf = await makePngBuffer(768, 768);
    const result = await processSubmissionImage(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.width).toBe(768);
    expect(result.data.height).toBe(768);
  });

  test("CREATOR_LOOKS_IMAGE_MIN_DIMENSION 定数は 768", () => {
    expect(CREATOR_LOOKS_IMAGE_MIN_DIMENSION).toBe(768);
  });

  test("WebP 入力も valid (= 既に WebP の画像も処理可)", async () => {
    const webpBuf = await sharp({
      create: {
        width: 768,
        height: 768,
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
