/**
 * モデル設定とペルコイン消費量定義
 */

import { normalizeModelName, type GeminiModel } from "../types";

/**
 * モデルごとのペルコイン消費量
 */
export const MODEL_PERCOIN_COSTS = {
  'gemini-2.5-flash-image': 20,
  'gemini-3-pro-image-1k': 50,
  'gemini-3-pro-image-2k': 80,
  'gemini-3-pro-image-4k': 100,
} as const;

/**
 * モデル名からペルコイン消費量を取得
 */
export function getPercoinCost(model: string): number {
  const normalized = normalizeModelName(model);
  return MODEL_PERCOIN_COSTS[normalized as keyof typeof MODEL_PERCOIN_COSTS] ?? 20;
}
