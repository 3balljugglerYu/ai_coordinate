/** @jest-environment node */

import sharp from "sharp";
import { convertCatalogImageToWebp } from "@/features/catalog/lib/catalog-image";

describe("convertCatalogImageToWebp", () => {
  test("正常な PNG 入力を WebP に変換する", async () => {
    // 100x80 の単色 PNG を生成して入力にする
    const input = await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const output = await convertCatalogImageToWebp(input);

    // WebP の RIFF/WEBP シグネチャを検査
    expect(output.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(output.subarray(8, 12).toString("ascii")).toBe("WEBP");

    // メタデータが WebP であることを確認
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    // 100x80 は MAX_WIDTH/HEIGHT 内なので寸法はそのまま (withoutEnlargement)
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(80);
  });

  test("MAX_WIDTH (2048) を超える画像はアスペクト比を保って縮小される", async () => {
    // 4000x2000 の画像 → 2048x1024 に縮小される想定
    const input = await sharp({
      create: {
        width: 4000,
        height: 2000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const output = await convertCatalogImageToWebp(input);
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(1024);
  });

  test("不正なバッファは sharp が例外を投げる", async () => {
    const garbage = Buffer.from("not an image");
    await expect(convertCatalogImageToWebp(garbage)).rejects.toThrow();
  });
});
