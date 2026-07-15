import sharp from "sharp";
import { composeMount } from "@/features/collections/lib/compose-mount";
import type { NormalizedSlotRect } from "@/features/collections/lib/mount-layouts";

// 透明な台紙(100x100)と、全面を覆う不透明な赤いシールを1枚だけ配置する構成。
// スロットは台紙全面(0,0,1,1)。角丸の有無を四隅/中心の alpha で検証する。
const SIZE = 100;
const SLOTS: NormalizedSlotRect[] = [{ x: 0, y: 0, w: 1, h: 1 }];

async function transparentTemplate(): Promise<Buffer> {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

async function redSticker(): Promise<Buffer> {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

/** 出力 PNG の指定ピクセルの alpha(0..255)を返す。 */
async function alphaAt(png: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return data[idx + info.channels - 1];
}

describe("composeMount 角丸マスク", () => {
  it("cornerRadiusRatio 未指定なら四隅まで不透明(従来の四角貼り)", async () => {
    const out = await composeMount({
      templatePng: await transparentTemplate(),
      stickers: [await redSticker()],
      slots: SLOTS,
    });
    expect(await alphaAt(out, 0, 0)).toBe(255); // 左上隅も不透明
    expect(await alphaAt(out, SIZE - 1, SIZE - 1)).toBe(255); // 右下隅も不透明
    expect(await alphaAt(out, SIZE / 2, SIZE / 2)).toBe(255); // 中心
  });

  it("cornerRadiusRatio>0 なら四隅が透過し、中心は不透明", async () => {
    const out = await composeMount({
      templatePng: await transparentTemplate(),
      stickers: [await redSticker()],
      slots: SLOTS,
      cornerRadiusRatio: 0.3,
    });
    // 四隅(0,0)は角丸で切り取られ透過(背後の透明台紙が覗く)。
    expect(await alphaAt(out, 0, 0)).toBe(0);
    // 中心は不透明のまま。
    expect(await alphaAt(out, SIZE / 2, SIZE / 2)).toBe(255);
  });
});
