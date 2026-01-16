/**
 * heic-convertモジュールの型定義
 * HEIC/HEIF画像をJPEG/PNGに変換するライブラリ
 */

declare module "heic-convert" {
  interface ConvertOptions {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number; // JPEG形式の場合のみ有効（0-1）
  }

  /**
   * HEIC/HEIF画像をJPEGまたはPNG形式に変換
   * @param options 変換オプション
   * @returns 変換後の画像データ（ArrayBuffer）
   */
  function convert(options: ConvertOptions): Promise<ArrayBuffer>;

  export default convert;
}
