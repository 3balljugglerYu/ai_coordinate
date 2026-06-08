import "server-only";

import sharp from "sharp";
import {
  getMountLayout,
  toPixelRect,
  type MountLayoutKey,
} from "./mount-layouts";

/**
 * 台紙テンプレ(空PNG)の各スロットへ、完成シール(ホロ+キャラ+名前まで焼き込み済みの
 * 正方形画像)をそのまま配置して合成する。名前・番号の描画はしない(ADR-003)。
 *
 * stickers はスロット順(= display_order 順)で渡す。stickers の数が不足する場合、
 * 余ったスロットはテンプレのホロ背景のまま残る。
 */
export async function composeMount(params: {
  templatePng: Buffer;
  stickers: Buffer[];
  layout: MountLayoutKey;
}): Promise<Buffer> {
  const { templatePng, stickers, layout } = params;

  const base = sharp(templatePng);
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("compose-mount: invalid template dimensions");
  }

  const slots = getMountLayout(layout);
  const count = Math.min(stickers.length, slots.length);

  const composites = [];
  for (let i = 0; i < count; i++) {
    const px = toPixelRect(slots[i], width, height);
    if (px.width <= 0 || px.height <= 0) {
      continue;
    }
    const resized = await sharp(stickers[i])
      .resize(px.width, px.height, { fit: "cover" })
      .png()
      .toBuffer();
    composites.push({ input: resized, left: px.left, top: px.top });
  }

  return base.composite(composites).png().toBuffer();
}
