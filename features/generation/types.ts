/**
 * 画像生成機能の型定義
 */

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
export const BACKGROUND_MODES = ["ai_auto", "include_in_prompt", "keep"] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

// データベース保存用のモデル名型（サイズ情報を含む）
export type GeminiModel = 
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-1k'
  | 'gemini-3-pro-image-2k'
  | 'gemini-3-pro-image-4k';

// APIエンドポイント用のモデル名型
export type GeminiApiModel = 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview';

/**
 * データベース保存用のモデル名に正規化（APIエンドポイント名から変換）
 */
export function normalizeModelName(model: string): GeminiModel {
  // APIエンドポイント名をデータベース保存値に変換
  if (model === 'gemini-2.5-flash-image-preview' || model === 'gemini-2.5-flash-image') {
    return 'gemini-2.5-flash-image';
  }
  // gemini-3-pro-image-preview や gemini-3-pro-image はデフォルトで2Kとして扱う（後方互換性）
  if (model === 'gemini-3-pro-image-preview' || model === 'gemini-3-pro-image') {
    return 'gemini-3-pro-image-2k';
  }
  // サイズ情報を含むモデル名はそのまま返す
  if (model === 'gemini-3-pro-image-1k' || model === 'gemini-3-pro-image-2k' || model === 'gemini-3-pro-image-4k') {
    return model as GeminiModel;
  }
  // デフォルトはStable版
  return 'gemini-2.5-flash-image';
}

/**
 * データベース保存値をAPIエンドポイント名に変換
 */
export function toApiModelName(model: GeminiModel): GeminiApiModel {
  // gemini-3-pro-image-* の場合は全て gemini-3-pro-image-preview を使用
  if (model.startsWith('gemini-3-pro-image-')) {
    return 'gemini-3-pro-image-preview';
  }
  return 'gemini-2.5-flash-image';
}

/**
 * モデル名から画像サイズを抽出（Gemini 3 Pro Image Preview用）
 */
export function extractImageSize(model: GeminiModel): "1K" | "2K" | "4K" | null {
  if (model === 'gemini-3-pro-image-1k') return "1K";
  if (model === 'gemini-3-pro-image-2k') return "2K";
  if (model === 'gemini-3-pro-image-4k') return "4K";
  return null; // gemini-2.5-flash-imageの場合
}

/**
 * 旧仕様のbackgroundChange(boolean)を新仕様のbackgroundModeに変換
 */
export function backgroundChangeToBackgroundMode(
  backgroundChange?: boolean | null
): BackgroundMode {
  return backgroundChange ? "ai_auto" : "keep";
}

/**
 * 新仕様のbackgroundModeを旧仕様のbackgroundChange(boolean)に変換
 */
export function backgroundModeToBackgroundChange(backgroundMode: BackgroundMode): boolean {
  return backgroundMode === "ai_auto";
}

/**
 * backgroundModeが未指定の場合はbackgroundChangeから推論
 */
export function resolveBackgroundMode(
  backgroundMode?: BackgroundMode | null,
  backgroundChange?: boolean | null
): BackgroundMode {
  return backgroundMode ?? backgroundChangeToBackgroundMode(backgroundChange);
}

export interface GenerationRequest {
  prompt: string;
  sourceImage?: File;
  sourceImageStockId?: string;
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
