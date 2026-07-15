import "server-only";

import sharp from "sharp";
import { toPixelRect, type NormalizedSlotRect } from "./mount-layouts";

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
  /** 配置スロット(正規化矩形)。呼び出し側で mount_slots ?? プリセットを解決して渡す */
  slots: NormalizedSlotRect[];
  /**
   * 各画像を角丸マスクする半径(スロット短辺に対する比率, 0..0.5)。
   * 0/未指定は角丸なし(従来の四角貼り)。ことわざ辞典など一部シリーズでのみ使う。
   * 角は透過し、背後の台紙テンプレが覗く(＝角丸で貼ったように見える)。
   */
  cornerRadiusRatio?: number;
}): Promise<Buffer> {
  const { templatePng, stickers, slots, cornerRadiusRatio = 0 } = params;

  const base = sharp(templatePng);
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error("compose-mount: invalid template dimensions");
  }

  const count = Math.min(stickers.length, slots.length);
  const clampedRatio = Math.max(0, Math.min(0.5, cornerRadiusRatio));

  const composites = [];
  for (let i = 0; i < count; i++) {
    const px = toPixelRect(slots[i], width, height);
    if (px.width <= 0 || px.height <= 0) {
      continue;
    }
    let pipeline = sharp(stickers[i]).resize(px.width, px.height, {
      fit: "cover",
    });
    if (clampedRatio > 0) {
      const radius = Math.round(Math.min(px.width, px.height) * clampedRatio);
      if (radius > 0) {
        // SVG の角丸矩形を dest-in で合成し、四隅を透過させる(角丸マスク)。
        const mask = Buffer.from(
          `<svg width="${px.width}" height="${px.height}">` +
            `<rect x="0" y="0" width="${px.width}" height="${px.height}" ` +
            `rx="${radius}" ry="${radius}"/></svg>`,
        );
        pipeline = pipeline
          .ensureAlpha()
          .composite([{ input: mask, blend: "dest-in" }]);
      }
    }
    const resized = await pipeline.png().toBuffer();
    composites.push({ input: resized, left: px.left, top: px.top });
  }

  return base.composite(composites).png().toBuffer();
}
