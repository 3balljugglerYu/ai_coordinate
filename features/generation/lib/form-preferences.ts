/**
 * GenerationForm のユーザー設定をブラウザ間で永続化するためのヘルパー。
 *
 * 対象は「ユーザーが意図的に選択する設定」のみで、生成ごとにリセットしたい
 * フィールド（プロンプト、生成枚数、画像ソース等）は対象外。
 *
 * 永続化先: localStorage（ユーザー単位ではなくブラウザ単位）。
 * - ログアウトしても残るのが要件なので DB ではなく localStorage を選択
 * - 共有 PC では他人にも引き継がれる点は要件範囲外
 *
 * SSR セーフ:
 * - `typeof window === "undefined"` で server 側を弾く
 * - localStorage アクセスは try/catch（プライベートブラウジング / quota 超過対策）
 * - 検証 NG（旧モデル ID 等）は default にフォールバック
 */

import {
  BACKGROUND_MODES,
  type BackgroundMode,
} from "@/shared/generation/prompt-core";
import type { GeminiModel } from "@/features/generation/types";

export const SELECTED_MODEL_STORAGE_KEY = "persta-ai:last-selected-model";
export const BACKGROUND_MODE_STORAGE_KEY = "persta-ai:last-background-mode";

const DEFAULT_MODEL: GeminiModel = "gemini-3.1-flash-image-preview-512";
const DEFAULT_BACKGROUND_MODE: BackgroundMode = "keep";

/**
 * GenerationForm の `<Select>` で実際に表示しているモデル ID 一覧。
 * 旧 `gemini-2.5-flash-image` 等の legacy 値を localStorage から復元しても
 * Select に対応する `<SelectItem>` が無いと UI が崩れるため、表示中のものに
 * 限って受理する。
 *
 * 注意: GenerationForm.tsx の `<SelectItem>` を増減する場合はここも更新する。
 */
const PERSISTABLE_MODELS: ReadonlyArray<GeminiModel> = [
  "gemini-3.1-flash-image-preview-512",
  "gemini-3.1-flash-image-preview-1024",
  "gemini-3-pro-image-1k",
  "gemini-3-pro-image-2k",
  "gemini-3-pro-image-4k",
  "gpt-image-2-low",
];

function safeReadLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private browsing / quota exceeded — silently ignore
  }
}

export function readPreferredModel(): GeminiModel {
  const stored = safeReadLocalStorage(SELECTED_MODEL_STORAGE_KEY);
  if (stored && (PERSISTABLE_MODELS as ReadonlyArray<string>).includes(stored)) {
    return stored as GeminiModel;
  }
  return DEFAULT_MODEL;
}

export function writePreferredModel(model: GeminiModel): void {
  if (!(PERSISTABLE_MODELS as ReadonlyArray<string>).includes(model)) {
    return;
  }
  safeWriteLocalStorage(SELECTED_MODEL_STORAGE_KEY, model);
}

export function readPreferredBackgroundMode(): BackgroundMode {
  const stored = safeReadLocalStorage(BACKGROUND_MODE_STORAGE_KEY);
  if (
    stored &&
    (BACKGROUND_MODES as ReadonlyArray<string>).includes(stored)
  ) {
    return stored as BackgroundMode;
  }
  return DEFAULT_BACKGROUND_MODE;
}

export function writePreferredBackgroundMode(mode: BackgroundMode): void {
  if (!(BACKGROUND_MODES as ReadonlyArray<string>).includes(mode)) {
    return;
  }
  safeWriteLocalStorage(BACKGROUND_MODE_STORAGE_KEY, mode);
}
