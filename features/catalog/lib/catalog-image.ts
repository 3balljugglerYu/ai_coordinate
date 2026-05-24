/**
 * カタログ画像のアップロード保存用ユーティリティ (サーバー専用)。
 */

import sharp from "sharp";

// 保存する WebP の最大寸法。配信時変換 (repository.ts の width 1280) に対する
// 余裕を残しつつ、4K 級の巨大な原画像を Web に適したサイズへ抑える。
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 4096;
const WEBP_QUALITY = 82;

/**
 * アップロードされた画像を、Storage 保存用の WebP に変換する。
 *
 * - EXIF 回転を反映する (.rotate())
 * - アスペクト比を保ったまま最大 2048×4096 内へ縮小する (拡大はしない)
 * - WebP (quality 82) へエンコードする
 *
 * 不正・破損した画像データの場合は sharp が例外を投げるため、
 * 呼び出し側で捕捉してエラー応答を返すこと。
 */
export async function convertCatalogImageToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(MAX_WIDTH, MAX_HEIGHT, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
