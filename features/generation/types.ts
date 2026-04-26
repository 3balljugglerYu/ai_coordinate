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

export type GenerationType =
  | 'coordinate'
  | 'specified_coordinate'
  | 'full_body'
  | 'chibi'
  | 'one_tap_style';

// データベース保存用のモデル名型（サイズ情報を含む）
// 注: 名称は歴史的経緯で GeminiModel のまま。OpenAI モデルも同 union に含めるため
// 新コードでは ImageGenerationModel エイリアスを参照すること。
export type GeminiModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-image-preview-512'
  | 'gemini-3.1-flash-image-preview-1024'
  | 'gemini-3-pro-image-1k'
  | 'gemini-3-pro-image-2k'
  | 'gemini-3-pro-image-4k'
  | 'gpt-image-2-low';

// 画像生成モデル全体の型エイリアス（将来のリネーム足場）
export type ImageGenerationModel = GeminiModel;

/**
 * 全画面共通の既定モデル ID。
 * フォーム初期値、サーバー側スキーマ default、normalize の fallback の単一の正本。
 * 拡張ヘルパは @/features/generation/lib/model-config.ts を参照。
 */
export const DEFAULT_GENERATION_MODEL: GeminiModel = 'gpt-image-2-low';

// APIエンドポイント用のモデル名型
export type GeminiApiModel =
  | 'gemini-2.5-flash-image'
  | 'gemini-3.1-flash-image-preview'
  | 'gemini-3-pro-image-preview';

export type GeminiImageSize = "512" | "1K" | "2K" | "4K";

/**
 * モデル ID が OpenAI 系 (gpt-image-*) かを判定
 */
export function isOpenAIImageModel(model: string | null | undefined): boolean {
  return typeof model === 'string' && model.startsWith('gpt-image-');
}

/**
 * データベース保存用のモデル名に正規化（APIエンドポイント名から変換）
 */
export function normalizeModelName(model: string | null | undefined): GeminiModel {
  if (!model) {
    return DEFAULT_GENERATION_MODEL;
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
  // OpenAI 系モデルはそのまま通す
  if (model === 'gpt-image-2-low') {
    return model as GeminiModel;
  }
  // 不明な値は全画面共通の既定モデルへ寄せる
  return DEFAULT_GENERATION_MODEL;
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
  galleryKey?: string;
  jobId?: string;
  isPreview?: boolean;
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
