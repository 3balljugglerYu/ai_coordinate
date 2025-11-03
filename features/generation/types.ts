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
}

export interface GenerationResponse {
  id: string;
  status: GenerationStatus;
  imageUrl?: string;
  error?: string;
}

