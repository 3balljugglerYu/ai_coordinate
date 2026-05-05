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
  | 'one_tap_style'
  | 'inspire';

/**
 * inspire 生成時の override_target。null=keep_all（テンプレ全要素を維持してキャラだけ差し替え）。
 */
export type InspireOverrideTarget =
  | 'angle'
  | 'pose'
  | 'outfit'
  | 'background';

export const INSPIRE_OVERRIDE_TARGETS: ReadonlyArray<InspireOverrideTarget> = [
  'angle',
  'pose',
  'outfit',
  'background',
];

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
 * Gemini API に投げられるモデル ID のサブセット。
 * `toApiModelName()` の入力を「Gemini ファミリーのみ」に絞るために使う。
 * OpenAI 系（`gpt-image-*`）は別経路（`features/generation/lib/openai-image.ts`）で扱う。
 */
export type GeminiOnlyModel = Exclude<GeminiModel, 'gpt-image-2-low'>;

/**
 * クライアントが API に送ってよい model 値の正本リスト。
 * 後方互換のためのエイリアス（`gemini-2.5-flash-image-preview` 等）も含む。
 *
 * Zod の `model.enum(...)` と必ず一致させる。これを「既知の raw 入力」の判定に使うと、
 * `normalizeModelName()` の fallback で「未知の値も既定モデルへ丸めて受理してしまう」
 * 挙動を回避できる（ゲスト経路の whitelist で重要）。
 */
export const KNOWN_MODEL_INPUTS = [
  'gemini-3.1-flash-image-preview-512',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k',
  'gpt-image-2-low',
  'gemini-2.5-flash-image-preview',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image',
] as const;

export type KnownModelInput = (typeof KNOWN_MODEL_INPUTS)[number];

export function isKnownModelInput(value: unknown): value is KnownModelInput {
  return (
    typeof value === 'string' &&
    (KNOWN_MODEL_INPUTS as ReadonlyArray<string>).includes(value)
  );
}

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
 * データベース保存値を Gemini API のエンドポイント名に変換する。
 *
 * OpenAI 系（`gpt-image-*`）はそもそも Gemini API に投げないので、
 * 入力型を `GeminiOnlyModel` に絞り、ランタイムでも防御する。
 * 旧シグネチャ（`GeminiModel` 全体を受ける）は OpenAI モデルが Gemini 名へ
 * 黙って誤変換される事故源だったため、本関数は OpenAI モデルを受けたら
 * 例外で失敗させる方針に変更している。
 */
export function toApiModelName(model: GeminiOnlyModel): GeminiApiModel {
  // 型が広い呼び出し側（unknown を経由するなど）からの誤投入を防ぐためのガード
  if (isOpenAIImageModel(model)) {
    throw new Error(
      `toApiModelName: OpenAI image models are not Gemini-routable: ${String(model)}`
    );
  }
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
  // リスト表示で使用する追加情報。グリッド表示では参照されないため optional。
  prompt?: string;
  createdAt?: string;
  model?: GeminiModel | null;
  width?: number | null;
  height?: number | null;
  // 元画像がストック由来かどうか（リスト表示でバッジを出すために使用）
  fromStock?: boolean;
  // Before 画像の永続化パス。拡大表示モーダルで Before/After トグルを
  // 同期的に判定するために伝播する（API 呼び出しを省略するため optional フィールド）。
  preGenerationStoragePath?: string | null;
  // ユーザーが「Before 画像を表示しない」を選択しているかどうか。
  // false のとき Before/After トグルは出さない。
  showBeforeImage?: boolean;
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
