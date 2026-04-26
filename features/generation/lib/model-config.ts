/**
 * モデル設定とペルコイン消費量定義
 */

import { DEFAULT_GENERATION_MODEL, normalizeModelName, type GeminiModel } from "../types";

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
 * 未ログインユーザーが選択可能なモデル一覧。
 * これ以外のモデルは UI 上「南京錠」で表示し、API では 400 で拒否する。
 */
export const GUEST_ALLOWED_MODELS: ReadonlyArray<GeminiModel> = [
  'gpt-image-2-low',
  'gemini-3.1-flash-image-preview-512',
];

export function isGuestAllowedModel(model: string | null | undefined): boolean {
  return (
    typeof model === 'string' &&
    (GUEST_ALLOWED_MODELS as ReadonlyArray<string>).includes(model)
  );
}

/**
 * モデル名からペルコイン消費量を取得
 */
export function getPercoinCost(model: string | null | undefined): number {
  const normalized = normalizeModelName(model);
  return MODEL_PERCOIN_COSTS[normalized as keyof typeof MODEL_PERCOIN_COSTS] ?? 10;
}
