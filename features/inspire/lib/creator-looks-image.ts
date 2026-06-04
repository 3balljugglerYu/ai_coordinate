/**
 * Creator Looks: サーバ側画像処理ヘルパ
 *
 * 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-001, HI-003 (Security)
 *
 * 目的:
 *   - client 申告の `file.type` を信用せず、**サーバ側で magic-byte ベース** に format 判定
 *   - 寸法上限 (max 4096×4096) を server で強制
 *   - sharp で **WebP 再エンコード** することで:
 *     - EXIF / GPS / ICC profile を除去 (= プライバシー保護)
 *     - polyglot file (= PNG ヘッダ + 末尾に PHP/JS payload) を無害化
 *   - 既存 `convertToWebP` ヘルパは「リサイズ + WebP 変換」だが、本ヘルパは
 *     「magic-byte 検証 + 寸法上限 + 再エンコード」に責務を絞る
 *
 * 使用箇所: app/api/style-templates/preview-generation/handler.ts の Creator Looks モード
 * 単体テスト容易性: pure (= I/O は sharp のみ、外部 API なし)
 */

import sharp from "sharp";

import { SUBMISSION_IMAGE_MIN_DIMENSION } from "./submission-image-constraints";

const MAX_DIMENSION = 4096;
// 低解像度の素材は生成品質を落とすため、両辺とも下限を強制する (client と共有の定数)
const MIN_DIMENSION = SUBMISSION_IMAGE_MIN_DIMENSION;
const WEBP_QUALITY = 85;

// magic-byte ベースで受け付ける format (sharp が判定する文字列)
const ALLOWED_FORMATS = [
  "jpeg",
  "png",
  "webp",
  "heif", // = HEIF / HEIC を含む (sharp は heif として返す)
] as const;

type AllowedFormat = (typeof ALLOWED_FORMATS)[number];

export type ImageProcessingErrorCode =
  | "INVALID_BUFFER"
  | "FORMAT_NOT_SUPPORTED"
  | "DIMENSION_TOO_LARGE"
  | "DIMENSION_TOO_SMALL"
  | "DIMENSION_MISSING"
  | "RE_ENCODE_FAILED";

export interface ImageProcessingError {
  code: ImageProcessingErrorCode;
  message: string;
}

export interface ProcessedSubmissionImage {
  /** WebP 再エンコード後のバッファ (= EXIF 除去済み、polyglot 無害化済み) */
  webpBuffer: Buffer;
  /** 出力画像の幅 (px) */
  width: number;
  /** 出力画像の高さ (px) */
  height: number;
  /** 入力画像から magic-byte 検出した元 format */
  originalFormat: AllowedFormat;
}

export type ProcessSubmissionImageResult =
  | { ok: true; data: ProcessedSubmissionImage }
  | { ok: false; error: ImageProcessingError };

/**
 * 投稿された画像バッファを安全な WebP に再エンコードする。
 *
 * 検証順:
 *   1. sharp が metadata を読めるか (= 不正バッファ rejection)
 *   2. 検出された format が許可リスト内か (magic-byte ベース)
 *   3. width / height が取得できるか
 *   4. 寸法が MAX_DIMENSION 以下か
 *   5. WebP 再エンコード (= EXIF / 全 metadata を捨てる、orientation だけ画素に反映)
 *
 * 成功時の戻り値はそのまま Storage upload に使える。
 */
export async function processSubmissionImage(
  buffer: Buffer,
): Promise<ProcessSubmissionImageResult> {
  // 1. magic-byte 検証 + metadata 取得
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "INVALID_BUFFER",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  // 2. format 検証
  const detectedFormat = metadata.format;
  if (
    !detectedFormat ||
    !ALLOWED_FORMATS.includes(detectedFormat as AllowedFormat)
  ) {
    return {
      ok: false,
      error: {
        code: "FORMAT_NOT_SUPPORTED",
        message: `Detected format "${detectedFormat ?? "unknown"}" is not allowed (allowed: ${ALLOWED_FORMATS.join(", ")})`,
      },
    };
  }
  const originalFormat = detectedFormat as AllowedFormat;

  // 3. width / height 取得確認
  if (!metadata.width || !metadata.height) {
    return {
      ok: false,
      error: {
        code: "DIMENSION_MISSING",
        message: "Could not read width/height from image metadata",
      },
    };
  }

  // 4. 寸法上限
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    return {
      ok: false,
      error: {
        code: "DIMENSION_TOO_LARGE",
        message: `Image is ${metadata.width}x${metadata.height}, max allowed is ${MAX_DIMENSION}x${MAX_DIMENSION}`,
      },
    };
  }

  // 4b. 寸法下限 (= 低解像度の素材は生成品質を落とすため reject)。両辺とも MIN_DIMENSION 以上。
  if (metadata.width < MIN_DIMENSION || metadata.height < MIN_DIMENSION) {
    return {
      ok: false,
      error: {
        code: "DIMENSION_TOO_SMALL",
        message: `Image is ${metadata.width}x${metadata.height}, min required is ${MIN_DIMENSION}x${MIN_DIMENSION}`,
      },
    };
  }

  // 5. WebP 再エンコード (= EXIF / GPS / ICC profile を捨てる、orientation は画素化)
  // sharp は明示的に withMetadata() を呼ばなければ EXIF を出力に含めない。
  // rotate() で EXIF orientation を画素方向に反映 (= reader 依存の表示崩れを防ぐ)。
  let webpBuffer: Buffer;
  try {
    webpBuffer = await sharp(buffer)
      .rotate()
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "RE_ENCODE_FAILED",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  // 再エンコード後の最終 metadata を読み直す (= rotate で width/height が swap する場合あり)
  let finalMetadata;
  try {
    finalMetadata = await sharp(webpBuffer).metadata();
  } catch {
    finalMetadata = null;
  }

  return {
    ok: true,
    data: {
      webpBuffer,
      width: finalMetadata?.width ?? metadata.width,
      height: finalMetadata?.height ?? metadata.height,
      originalFormat,
    },
  };
}

export const CREATOR_LOOKS_IMAGE_MAX_DIMENSION = MAX_DIMENSION;
export const CREATOR_LOOKS_IMAGE_MIN_DIMENSION = MIN_DIMENSION;
export const CREATOR_LOOKS_IMAGE_ALLOWED_FORMATS = ALLOWED_FORMATS;
