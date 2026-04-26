/**
 * モデル設定とペルコイン消費量定義
 */

import {
  DEFAULT_GENERATION_MODEL,
  isKnownModelInput,
  normalizeModelName,
  type GeminiModel,
} from "../types";

export { DEFAULT_GENERATION_MODEL };

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
  'gpt-image-2-low': 10,
} as const;

/**
 * 未ログインユーザーが選択可能な canonical モデル一覧。
 * UI で「南京錠」を出すかどうかと、サーバー側で 400 を返すかどうかの両方の正本。
 *
 * 注意: ここに含まれるのは canonical model（DB に保存される正規化済みの値）。
 * クライアントから受け取った生の入力に対しては `parseGuestRequestedModel()` を使うこと。
 */
export const GUEST_ALLOWED_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low',
  'gemini-3.1-flash-image-preview-512',
];

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
 * モデル名からペルコイン消費量を取得
 */
export function getPercoinCost(model: string | null | undefined): number {
  const normalized = normalizeModelName(model);
  return MODEL_PERCOIN_COSTS[normalized as keyof typeof MODEL_PERCOIN_COSTS] ?? 10;
}
