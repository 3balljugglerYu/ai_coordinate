/**
 * 画像生成機能の型定義
 */

import type {
  BackgroundMode,
  SourceImageType,
} from "@/shared/generation/prompt-core";

export {
  BACKGROUND_MODES,
  SOURCE_IMAGE_TYPES,
  backgroundChangeToBackgroundMode,
  backgroundModeToBackgroundChange,
  resolveBackgroundMode,
} from "@/shared/generation/prompt-core";
export type { BackgroundMode };
export type { SourceImageType };

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export interface Generation {
  id: string;
  userId: string;
  prompt: string;
  status: GenerationStatus;
  imageUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type GenerationType = 'coordinate' | 'specified_coordinate' | 'full_body' | 'chibi';

// データベース保存用のモデル名型（サイズ情報を含む）
export type GeminiModel = 
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-image-preview-512'
  | 'gemini-3.1-flash-image-preview-1024'
  | 'gemini-3-pro-image-1k'
  | 'gemini-3-pro-image-2k'
  | 'gemini-3-pro-image-4k';

// APIエンドポイント用のモデル名型
export type GeminiApiModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-pro-image-preview';

export type GeminiImageSize = "512" | "1K" | "2K" | "4K";

/**
 * データベース保存用のモデル名に正規化（APIエンドポイント名から変換）
 */
export function normalizeModelName(model: string | null | undefined): GeminiModel {
  if (!model) {
    return 'gemini-3.1-flash-image-preview-512';
  }

  // 廃止した 2.5 は新しい軽量モデルへ吸収する
  if (model === 'gemini-2.5-flash-image-preview' || model === 'gemini-2.5-flash-image') {
    return 'gemini-3.1-flash-image-preview-512';
  }
  if (model === 'gemini-3.1-flash-image-preview') {
    return 'gemini-3.1-flash-image-preview-512';
  }
  if (
    model === 'gemini-3.1-flash-image-preview-512' ||
    model === 'gemini-3.1-flash-image-preview-1024'
  ) {
    return model as GeminiModel;
  }
  // gemini-3-pro-image-preview や gemini-3-pro-image はデフォルトで2Kとして扱う（後方互換性）
  if (model === 'gemini-3-pro-image-preview' || model === 'gemini-3-pro-image') {
    return 'gemini-3-pro-image-2k';
  }
  // サイズ情報を含むモデル名はそのまま返す
  if (model === 'gemini-3-pro-image-1k' || model === 'gemini-3-pro-image-2k' || model === 'gemini-3-pro-image-4k') {
    return model as GeminiModel;
  }
  // デフォルトは新しい軽量モデル
  return 'gemini-3.1-flash-image-preview-512';
}

/**
 * データベース保存値をAPIエンドポイント名に変換
 */
export function toApiModelName(model: GeminiModel): GeminiApiModel {
  if (model.startsWith('gemini-3.1-flash-image-preview-')) {
    return 'gemini-3.1-flash-image-preview';
  }
  // gemini-3-pro-image-* の場合は全て gemini-3-pro-image-preview を使用
  if (model.startsWith('gemini-3-pro-image-')) {
    return 'gemini-3-pro-image-preview';
  }
  return 'gemini-2.5-flash-image';
}

/**
 * モデル名から画像サイズを抽出（Gemini 3 Pro Image Preview用）
 */
export function extractImageSize(model: GeminiModel): GeminiImageSize | null {
  if (model === 'gemini-3.1-flash-image-preview-512') return "512";
  if (model === 'gemini-3.1-flash-image-preview-1024') return "1K";
  if (model === 'gemini-3-pro-image-1k') return "1K";
  if (model === 'gemini-3-pro-image-2k') return "2K";
  if (model === 'gemini-3-pro-image-4k') return "4K";
  return null; // gemini-2.5-flash-imageの場合
}

export interface GenerationRequest {
  prompt: string;
  sourceImage?: File;
  sourceImageStockId?: string;
  sourceImageType?: SourceImageType;
  backgroundMode?: BackgroundMode;
  // 後方互換（1リリース維持）
  // TODO(next-release): backgroundChangeの読み書きを削除し、backgroundModeへ完全移行する
  backgroundChange?: boolean;
  count?: number; // 1-4枚
  generationType?: GenerationType;
  model?: GeminiModel;
}

export interface GenerationResponse {
  id: string;
  status: GenerationStatus;
  images?: Array<{
    url: string;
    data?: string; // Base64データ
  }>;
  error?: string;
}

export interface GeneratedImageData {
  id: string;
  url: string;
  data?: string;
  is_posted: boolean;
}

/**
 * 画像アップロード関連の型定義
 */
export interface ImageUploadConfig {
  maxSizeMB: number;
  allowedFormats: string[];
  maxWidth?: number;
  maxHeight?: number;
}

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  file?: File;
  previewUrl?: string;
}

export interface UploadedImage {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}
