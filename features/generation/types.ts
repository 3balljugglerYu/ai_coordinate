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

export interface GenerationRequest {
  prompt: string;
  sourceImage?: File;
  sourceImageStockId?: string;
  backgroundChange?: boolean;
  count?: number; // 1-4枚
  generationType?: GenerationType;
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

