import type { ImageUploadConfig, ImageValidationResult } from "../types";

/**
 * 画像アップロードのデフォルト設定
 */
export const DEFAULT_IMAGE_CONFIG: ImageUploadConfig = {
  maxSizeMB: 10,
  allowedFormats: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  maxWidth: 4096,
  maxHeight: 4096,
};

/**
 * ファイルサイズをMB単位で取得
 */
function getFileSizeMB(file: File): number {
  return file.size / (1024 * 1024);
}

/**
 * ファイル形式が許可されているかチェック
 */
function isAllowedFormat(file: File, allowedFormats: string[]): boolean {
  return allowedFormats.includes(file.type);
}

/**
 * 画像の寸法を取得
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像の読み込みに失敗しました"));
    };

    img.src = url;
  });
}

/**
 * 画像ファイルのバリデーション
 */
export async function validateImageFile(
  file: File,
  config: ImageUploadConfig = DEFAULT_IMAGE_CONFIG
): Promise<ImageValidationResult> {
  // ファイル形式のチェック
  if (!isAllowedFormat(file, config.allowedFormats)) {
    return {
      isValid: false,
      error: `許可されていないファイル形式です。対応形式: ${config.allowedFormats.join(", ")}`,
    };
  }

  // ファイルサイズのチェック
  const sizeMB = getFileSizeMB(file);
  if (sizeMB > config.maxSizeMB) {
    return {
      isValid: false,
      error: `ファイルサイズが大きすぎます。最大${config.maxSizeMB}MBまでです。（現在: ${sizeMB.toFixed(2)}MB）`,
    };
  }

  // 画像の寸法チェック
  try {
    const dimensions = await getImageDimensions(file);

    if (config.maxWidth && dimensions.width > config.maxWidth) {
      return {
        isValid: false,
        error: `画像の幅が大きすぎます。最大${config.maxWidth}pxまでです。`,
      };
    }

    if (config.maxHeight && dimensions.height > config.maxHeight) {
      return {
        isValid: false,
        error: `画像の高さが大きすぎます。最大${config.maxHeight}pxまでです。`,
      };
    }

    // プレビューURL生成
    const previewUrl = URL.createObjectURL(file);

    return {
      isValid: true,
      file,
      previewUrl,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "画像の検証に失敗しました",
    };
  }
}

/**
 * ファイル拡張子から人間が読みやすい形式名を取得
 */
export function getReadableFileFormat(formats: string[]): string {
  return formats
    .map((format) => format.replace("image/", "").toUpperCase())
    .join(", ");
}

