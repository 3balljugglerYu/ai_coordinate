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
import {
  DEFAULT_GENERATION_MODEL,
  type GeminiModel,
} from "@/features/generation/types";

export const SELECTED_MODEL_STORAGE_KEY = "persta-ai:last-selected-model";
export const BACKGROUND_MODE_STORAGE_KEY = "persta-ai:last-background-mode";
export const IMAGE_SOURCE_TYPE_STORAGE_KEY = "persta-ai:last-image-source-type";
export const SELECTED_STOCK_ID_STORAGE_KEY = "persta-ai:last-selected-stock-id";
export const LEGACY_SELECTED_STOCK_ID_KEY = "selectedStockId";

const DEFAULT_MODEL: GeminiModel = DEFAULT_GENERATION_MODEL;
const DEFAULT_BACKGROUND_MODE: BackgroundMode = "keep";

export type PersistedImageSourceType = "upload" | "stock";
const PERSISTED_IMAGE_SOURCE_TYPES: ReadonlyArray<PersistedImageSourceType> = [
  "upload",
  "stock",
];
const DEFAULT_IMAGE_SOURCE_TYPE: PersistedImageSourceType = "upload";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function safeRemoveLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
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

export function readPreferredImageSourceType(): PersistedImageSourceType {
  const stored = safeReadLocalStorage(IMAGE_SOURCE_TYPE_STORAGE_KEY);
  if (
    stored &&
    (PERSISTED_IMAGE_SOURCE_TYPES as ReadonlyArray<string>).includes(stored)
  ) {
    return stored as PersistedImageSourceType;
  }
  return DEFAULT_IMAGE_SOURCE_TYPE;
}

export function writePreferredImageSourceType(
  type: PersistedImageSourceType
): void {
  if (!(PERSISTED_IMAGE_SOURCE_TYPES as ReadonlyArray<string>).includes(type)) {
    return;
  }
  safeWriteLocalStorage(IMAGE_SOURCE_TYPE_STORAGE_KEY, type);
}

export function readPreferredSelectedStockId(): string | null {
  const stored = safeReadLocalStorage(SELECTED_STOCK_ID_STORAGE_KEY);
  if (stored && UUID_REGEX.test(stored)) {
    return stored;
  }
  return null;
}

export function writePreferredSelectedStockId(stockId: string | null): void {
  if (stockId === null) {
    safeRemoveLocalStorage(SELECTED_STOCK_ID_STORAGE_KEY);
    return;
  }
  if (!UUID_REGEX.test(stockId)) {
    return;
  }
  safeWriteLocalStorage(SELECTED_STOCK_ID_STORAGE_KEY, stockId);
}

/**
 * 旧キー `"selectedStockId"` から新キーへの一回限りの移行。
 * - 旧キーが UUID 形式なら新キーへ転記
 * - そうでなければ単に破棄
 * - いずれにせよ旧キーは削除する
 */
export function migrateLegacySelectedStockIdKey(): void {
  if (typeof window === "undefined") return;
  const legacy = safeReadLocalStorage(LEGACY_SELECTED_STOCK_ID_KEY);
  if (legacy === null) {
    return;
  }
  if (UUID_REGEX.test(legacy)) {
    const existing = safeReadLocalStorage(SELECTED_STOCK_ID_STORAGE_KEY);
    if (!existing) {
      safeWriteLocalStorage(SELECTED_STOCK_ID_STORAGE_KEY, legacy);
    }
  }
  safeRemoveLocalStorage(LEGACY_SELECTED_STOCK_ID_KEY);
}
