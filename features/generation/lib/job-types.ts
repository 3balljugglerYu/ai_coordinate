/**
 * 画像生成ジョブ管理用の型定義
 * image_jobsテーブルに対応する型定義
 */

import type {
  BackgroundMode,
  GenerationType,
  GeminiModel,
  SourceImageType,
} from "../types";

/**
 * ジョブステータス
 */
export type ImageJobStatus = "queued" | "processing" | "succeeded" | "failed";

/**
 * ジョブ内部の進捗ステージ
 */
export type ImageJobProcessingStage =
  | "queued"
  | "processing"
  | "charging"
  | "generating"
  | "uploading"
  | "persisting"
  | "completed"
  | "failed";

/**
 * 画像生成ジョブ（データベースのimage_jobsテーブルに対応）
 */
export interface ImageJob {
  id: string;
  user_id: string;
  prompt_text: string;
  input_image_url: string | null;
  source_image_stock_id: string | null;
  source_image_type: SourceImageType;
  generation_type: GenerationType;
  generation_metadata?: Record<string, unknown> | null;
  model: GeminiModel | null;
  background_mode: BackgroundMode;
  background_change: boolean;
  status: ImageJobStatus;
  processing_stage: ImageJobProcessingStage | null;
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
  processing_stage?: ImageJobProcessingStage | null;
  attempts?: number;
};

/**
 * ジョブ更新用の型（部分更新）
 */
export type ImageJobUpdateInput = Partial<
  Pick<
    ImageJob,
    | "status"
    | "processing_stage"
    | "result_image_url"
    | "error_message"
    | "attempts"
    | "started_at"
    | "completed_at"
  >
>;
