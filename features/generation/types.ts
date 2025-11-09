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

export interface GenerationRequest {
  prompt: string;
  style?: string;
  size?: "small" | "medium" | "large";
  sourceImage?: File | string;
}

export interface GenerationResponse {
  id: string;
  status: GenerationStatus;
  imageUrl?: string;
  error?: string;
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

