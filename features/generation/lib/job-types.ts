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
  status: ImageJobStatus;
  processing_stage: ImageJobProcessingStage | null;
  requested_image_count: number;
  result_image_url: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  // Inspire (Phase 1 マイグレで追加された列。NULL 許容、generation_type='inspire' のときのみ NOT NULL)
  style_template_id?: string | null;
  style_reference_image_url?: string | null;
  // Inspire override 個別フラグ（チェックボックス UI 対応の Phase 2 マイグレで追加）。
  // generation_type='inspire' のときに利用。1 つ以上 true である必要がある。
  override_outfit?: boolean | null;
  override_angle?: boolean | null;
  override_pose?: boolean | null;
  override_background?: boolean | null;
  // Style preset カテゴリのスナップショット (preset_categories.key)。
  // generation_type='one_tap_style' の生成時に保存し、後で category が rename/削除されても
  // 過去ジョブの集計が連続するようにする。
  style_preset_category_key?: string | null;
  // one_tap_style の image_1 (style_reference_image_url) を取得する Storage bucket。
  // 'style_presets' = admin 登録の preset 参考画像、'generated-images' = ユーザーが
  // /style でアップロードした temp/{user_id}/... 画像。NULL は旧 job 互換で
  // 'style_presets' 扱い (worker 側で fallback)。
  style_reference_image_bucket?: "style_presets" | "generated-images" | null;
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
  | "requested_image_count"
  | "result_image_url"
  | "error_message"
  | "attempts"
  | "status"
> & {
  status?: ImageJobStatus;
  processing_stage?: ImageJobProcessingStage | null;
  attempts?: number;
  requested_image_count?: number;
};

/**
 * ジョブの生成実行入力（`generation_prompt_snapshots` の1行）。
 *
 * プロンプト本文は `anon` にも開放されている `generated_images` / `image_jobs`
 * には置かず、service-only のこのレコードだけに持つ。
 * 詳細は docs/planning/free-prompt-private-mode-implementation-plan.md ADR-001。
 *
 * ジョブと実行入力は必ず対で作る。実行入力を持たないジョブは Worker が
 * 生成入力を解決できず処理不能になるため、`createImageJob` の必須引数に
 * することで「渡し忘れたらコンパイルが通らない」状態にしている（REQ-003c）。
 */
export type PromptExecutionInput =
  | MaterializedPromptExecutionInput
  | DerivedPromptReferenceInput;

/**
 * 通常ジョブの実行入力。
 *
 * Worker が必要とするものは生成種別で異なる。
 *   coordinate / free : `authorInput`（生入力）。Worker が実行時に錨を付ける
 *   one_tap_style     : `providerPrompt`（組み立て済み全文）。そのまま送信する
 *   inspire           : どちらも不要。ジョブの列から組み立てる
 *
 * `authorInput` は原作者へ開示してよい入力で、生成成功時に author secret へ
 * 転記される。`providerPrompt` は運営資産で誰にも開示しない。
 * 両方を同時に持つことはできない（DB の CHECK 制約でも拒否する）。
 */
export interface MaterializedPromptExecutionInput {
  kind: "materialized";
  /** 運営が組み立てた開示不可の全文。one_tap_style のみ */
  providerPrompt?: string | null;
  /** 原作者の生入力。coordinate / free のみ */
  authorInput?: string | null;
  /** `authorInput` の所有者。`authorInput` があるときは必須 */
  authorInputOwnerId?: string | null;
  /** 生成由来。既定はジョブの `generation_type` */
  sourceKind?: string | null;
  /** プリセット版など、再試行時に固定したい識別子 */
  sourceRevision?: string | null;
}

/**
 * 派生ジョブの実行入力。本文を一切持たない。
 *
 * 原作のプロンプトは Worker が実行直前に author secret から解決し、
 * メモリ上でのみ組み立てる。派生件数に比例して秘密の永続コピーが増えることを
 * 避けるため、ここには参照すら持たせない（ADR-002）。
 */
export interface DerivedPromptReferenceInput {
  kind: "derived_reference";
}

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
