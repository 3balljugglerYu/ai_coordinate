/**
 * モデル設定とペルコイン消費量定義
 */

import {
  DEFAULT_GENERATION_MODEL,
  isKnownModelInput,
  isOpenAIImageModel,
  normalizeModelName,
  type GeminiModel,
} from "../types";
import { GPT_IMAGE_2_PERCOIN_COSTS } from "@/shared/generation/openai-image-model";

export { DEFAULT_GENERATION_MODEL };

/**
 * Gemini 画像生成の kill switch。
 *
 * 何らかの理由で Gemini を全画面で一時停止したいとき（Google Cloud プロジェクト停止・
 * モデル不調・コスト問題など）に env を未設定 / `false` にして、全画面の Gemini 系
 * モデルを `isModelAvailableForGeneration()` でフィルタアウトする。
 *
 * 切替手順（必ず両方を揃えること）:
 *   - Next.js 側: Vercel の env に `NEXT_PUBLIC_GEMINI_GENERATION_ENABLED=true` を
 *     設定して再デプロイ（`NEXT_PUBLIC_*` はビルド時に bake-in される）。
 *   - Supabase Edge Function 側: `supabase secrets set GEMINI_GENERATION_ENABLED=true`
 *     のあと `supabase functions deploy image-gen-worker` を実行。
 *
 * テスト: kill ON / OFF 双方の挙動は `tests/unit/features/generation/inspire-model-config.test.ts`
 * で担保している。integration テストでも `jest.mock` で `GEMINI_GENERATION_ENABLED: true`
 * を上書きして enabled 経路を検証している。
 */
export const GEMINI_GENERATION_ENABLED =
  process.env.NEXT_PUBLIC_GEMINI_GENERATION_ENABLED === "true";

export function isGeminiImageModel(model: string | null | undefined): boolean {
  return typeof model === "string" && !isOpenAIImageModel(model);
}

export function isModelAvailableForGeneration(
  model: string | null | undefined
): boolean {
  if (!isKnownModelInput(model)) {
    return false;
  }
  const canonical = normalizeModelName(model);
  return (
    !isGeminiImageModel(canonical) || GEMINI_GENERATION_ENABLED
  );
}

/**
 * モデルごとのペルコイン消費量
 */
export const MODEL_PERCOIN_COSTS = {
  'gemini-2.5-flash-image': 20,
  'gemini-3.1-flash-image-preview-512': 10,
  'gemini-3.1-flash-image-preview-1024': 20,
  'gemini-3-pro-image-1k': 50,
  'gemini-3-pro-image-2k': 80,
  'gemini-3-pro-image-4k': 100,
  ...GPT_IMAGE_2_PERCOIN_COSTS,
} as const;

/**
 * 未ログインユーザーが選択可能な canonical モデル一覧。
 * UI で「南京錠」を出すかどうかと、サーバー側で 400 を返すかどうかの両方の正本。
 *
 * 注意: ここに含まれるのは canonical model（DB に保存される正規化済みの値）。
 * クライアントから受け取った生の入力に対しては `parseGuestRequestedModel()` を使うこと。
 */
const BASE_GUEST_ALLOWED_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low-1k',
  'gemini-3.1-flash-image-preview-512',
];

export const GUEST_ALLOWED_MODELS: ReadonlyArray<GeminiModel> =
  BASE_GUEST_ALLOWED_MODELS.filter(isModelAvailableForGeneration);

/**
 * canonical model がゲスト許可リストに含まれるか判定する。
 * 既に `normalizeModelName()` を通した値、または UI 上の `<Select>` の `value` を渡すこと。
 * 生の API 入力には `parseGuestRequestedModel()` を使う。
 */
export function isCanonicalGuestAllowedModel(
  model: string | null | undefined
): model is GeminiModel {
  return (
    typeof model === 'string' &&
    (GUEST_ALLOWED_MODELS as ReadonlyArray<string>).includes(model)
  );
}

/**
 * クライアントから受け取った生の `model` 文字列をゲスト経路で安全に解釈する。
 *
 * - 既知のモデル入力（`KNOWN_MODEL_INPUTS`、エイリアス含む）に該当しない場合は `null`
 *   （`normalizeModelName()` が未知の値を既定モデルに丸めて誤って許可してしまうのを防ぐ）
 * - 既知ならば canonical へ正規化し、`GUEST_ALLOWED_MODELS` に含まれていれば canonical を返す
 * - 既知だがゲスト不許可なら `null`
 */
export function parseGuestRequestedModel(
  raw: string | null | undefined
): GeminiModel | null {
  if (!isKnownModelInput(raw)) {
    return null;
  }
  const canonical = normalizeModelName(raw);
  return isCanonicalGuestAllowedModel(canonical) ? canonical : null;
}

/**
 * UI state / localStorage に残ったモデルを、現在の認証状態で実際に使えるモデルへ丸める。
 *
 * ゲスト時は保存値そのものを書き換えず、送信・表示・料金表示で使う実効値だけを
 * DEFAULT_GENERATION_MODEL に clamp する。ログイン後は保存済みの選択をそのまま復元する。
 */
export function resolveEffectiveModelForAuthState(
  model: GeminiModel,
  authState: "guest" | "authenticated"
): GeminiModel {
  if (!isModelAvailableForGeneration(model)) {
    return DEFAULT_GENERATION_MODEL;
  }
  if (authState === "guest" && !isCanonicalGuestAllowedModel(model)) {
    return DEFAULT_GENERATION_MODEL;
  }
  return model;
}

/**
 * モデル名からペルコイン消費量を取得
 */
export function getPercoinCost(model: string | null | undefined): number {
  const normalized = normalizeModelName(model);
  return MODEL_PERCOIN_COSTS[normalized as keyof typeof MODEL_PERCOIN_COSTS] ?? 10;
}

/**
 * Inspire 機能で利用者が選択できるモデル一覧（1024px 以上のみ許可）。
 * 2 枚画像入力（user character + style template）を扱うため、低解像度モデルは品質面で除外。
 *
 * - gemini-3.1-flash-image-preview-512 は inspire 用途には除外（低解像度）
 * - プレビュー生成（運営コスト最小化）は別 INSPIRE_PREVIEW_MODELS を使用
 */
const BASE_INSPIRE_ALLOWED_MODELS: ReadonlyArray<GeminiModel> = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview-1024',
  'gemini-3-pro-image-1k',
  'gemini-3-pro-image-2k',
  'gemini-3-pro-image-4k',
  'gpt-image-2-low-1k',
  'gpt-image-2-low-2k',
  'gpt-image-2-low-4k',
  'gpt-image-2-medium-1k',
  'gpt-image-2-medium-2k',
  'gpt-image-2-medium-4k',
  // High の 2k/4k は利用コストが重いため、inspire では当面 high-1k に限定する。
  'gpt-image-2-high-1k',
];

export const INSPIRE_ALLOWED_MODELS: ReadonlyArray<GeminiModel> =
  BASE_INSPIRE_ALLOWED_MODELS.filter(isModelAvailableForGeneration);

/**
 * Inspire 申請プレビュー生成で使うモデル（運営コスト最小化のため低解像度に固定）。
 * 申請者は同期 API でこの 2 モデルから 2 枚を並列生成し、結果を見てから申請を確定する。
 */
const BASE_INSPIRE_PREVIEW_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low-1k',
  'gemini-3.1-flash-image-preview-512',
];

export const INSPIRE_PREVIEW_MODELS: ReadonlyArray<GeminiModel> =
  BASE_INSPIRE_PREVIEW_MODELS.filter(isModelAvailableForGeneration);

/**
 * canonical model が inspire 利用者の許可リストに含まれるか判定する。
 * 既に `normalizeModelName()` を通した値を渡すこと。
 */
export function isInspireAllowedModel(
  model: string | null | undefined
): model is GeminiModel {
  return (
    typeof model === 'string' &&
    (INSPIRE_ALLOWED_MODELS as ReadonlyArray<string>).includes(model)
  );
}
