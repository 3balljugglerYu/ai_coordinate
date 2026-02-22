/**
 * 画像生成ジョブ管理用の型定義
 * image_jobsテーブルに対応する型定義
 */

import type { BackgroundMode, GenerationType, GeminiModel } from "../types";

/**
 * ジョブステータス
 */
export type ImageJobStatus = "queued" | "processing" | "succeeded" | "failed";

/**
 * 画像生成ジョブ（データベースのimage_jobsテーブルに対応）
 */
export interface ImageJob {
  id: string;
  user_id: string;
  prompt_text: string;
  input_image_url: string | null;
  source_image_stock_id: string | null;
  generation_type: GenerationType;
  model: GeminiModel | null;
  background_mode: BackgroundMode;
  background_change: boolean;
  status: ImageJobStatus;
  result_image_url: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * ジョブ作成用の型（id、created_at、updated_at、started_at、completed_atを除く）
 */
export type ImageJobCreateInput = Omit<
  ImageJob,
  | "id"
  | "created_at"
  | "updated_at"
  | "started_at"
  | "completed_at"
  | "result_image_url"
  | "error_message"
  | "attempts"
  | "status"
> & {
  status?: ImageJobStatus;
  attempts?: number;
};

/**
 * ジョブ更新用の型（部分更新）
 */
export type ImageJobUpdateInput = Partial<
  Pick<
    ImageJob,
    | "status"
    | "result_image_url"
    | "error_message"
    | "attempts"
    | "started_at"
    | "completed_at"
  >
>;
