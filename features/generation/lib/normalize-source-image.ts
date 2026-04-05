/**
 * アップロード画像の正規化ユーティリティ
 *
 * Vercel Serverless Function のリクエストボディ制限（4.5MB）を考慮し、
 * 大きな画像をリサイズ・圧縮してから送信できるようにする。
 */

const MAX_SOURCE_IMAGE_LONG_EDGE = 2048;
/** Vercel のリクエストボディ制限 4.5MB を考慮。Base64 で約 33% 増加するため、2MB 超は強圧縮 */
const LARGE_FILE_THRESHOLD_BYTES = 2 * 1024 * 1024;
const AGGRESSIVE_COMPRESSION_LONG_EDGE = 1024;
const AGGRESSIVE_JPEG_QUALITY = 0.7;
/** 拡張子除去用（js-hoist-regexp: ループ/関数内での再生成を避ける） */
const BASE_NAME_REGEX = /\.[^.]+$/;

export interface NormalizeSourceImageMessages {
  imageLoadFailed?: string;
  imageConvertFailed?: string;
  imageContextUnavailable?: string;
}

function loadImageElement(
  file: File,
  messages?: NormalizeSourceImageMessages
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(messages?.imageLoadFailed || "画像の読み込みに失敗しました"));
    };

    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
  messages?: NormalizeSourceImageMessages
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(messages?.imageConvertFailed || "画像の変換に失敗しました"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

/**
 * 画像ファイルを正規化（リサイズ・圧縮）する。
 *
 * - 2MB 超: 長辺 1024px にリサイズし JPEG 70% で圧縮（強圧縮）
 * - 2MB 以下かつ長辺 > 2048px: 長辺 2048px にリサイズし JPEG 80% で圧縮
 * - それ以外: そのまま返す
 */
export async function normalizeSourceImage(
  file: File,
  messages?: NormalizeSourceImageMessages
): Promise<File> {
  const image = await loadImageElement(file, messages);
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;
  const longEdge = Math.max(originalWidth, originalHeight);

  // ファイルサイズが大きい場合（Vercel 4.5MB 制限対策）は強圧縮を適用
  const needsAggressiveCompression = file.size > LARGE_FILE_THRESHOLD_BYTES;
  const maxLongEdge = needsAggressiveCompression
    ? AGGRESSIVE_COMPRESSION_LONG_EDGE
    : MAX_SOURCE_IMAGE_LONG_EDGE;
  const jpegQuality = needsAggressiveCompression
    ? AGGRESSIVE_JPEG_QUALITY
    : 0.8;

  if (longEdge <= maxLongEdge && !needsAggressiveCompression) {
    return file;
  }

  const scale = Math.min(1, maxLongEdge / longEdge);
  const targetWidth = Math.max(1, Math.round(originalWidth * scale));
  const targetHeight = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement("canvas");

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(
      messages?.imageContextUnavailable || "画像処理コンテキストの取得に失敗しました"
    );
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  // 強圧縮時は JPEG に統一（PNG は可逆圧縮のためファイルサイズが大きくなりやすい）
  const outputType =
    needsAggressiveCompression || file.type === "image/jpeg" || file.type === "image/jpg"
      ? "image/jpeg"
      : file.type === "image/png"
        ? "image/png"
        : "image/jpeg";
  const outputBlob = await canvasToBlob(
    canvas,
    outputType,
    outputType === "image/jpeg" ? jpegQuality : undefined,
    messages
  );

  const extension = outputType === "image/png" ? "png" : "jpg";
  const baseName = file.name.replace(BASE_NAME_REGEX, "");
  return new File([outputBlob], `${baseName}.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}
