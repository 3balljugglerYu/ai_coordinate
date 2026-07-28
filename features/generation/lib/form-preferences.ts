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
  GPT_IMAGE_2_CANONICAL_MODELS,
  GPT_IMAGE_2_LEGACY_LOW_MODEL,
  normalizeModelName,
  type GeminiModel,
} from "@/features/generation/types";
import {
  normalizeFreeOutputAspectRatioMode,
  normalizeUserSelectableOutputAspectRatioMode,
  type FreeOutputAspectRatioMode,
  type UserSelectableOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";

export const SELECTED_MODEL_STORAGE_KEY = "persta-ai:last-selected-model";
export const BACKGROUND_MODE_STORAGE_KEY = "persta-ai:last-background-mode";
export const COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY =
  "persta-ai:coordinate-stock-save-prompt-dismissed";
export const FREE_ASPECT_MODE_STORAGE_KEY = "persta-ai:free-output-aspect-mode";
/** One-Tap Style の比率は Free とは別に記憶する(モードごとに好みが異なるため)。 */
export const STYLE_ASPECT_MODE_STORAGE_KEY = "persta-ai:style-output-aspect-mode";

const DEFAULT_MODEL: GeminiModel = DEFAULT_GENERATION_MODEL;
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
  ...GPT_IMAGE_2_CANONICAL_MODELS,
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
  if (stored === GPT_IMAGE_2_LEGACY_LOW_MODEL) {
    const migrated = normalizeModelName(stored);
    safeWriteLocalStorage(SELECTED_MODEL_STORAGE_KEY, migrated);
    return migrated;
  }
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

/**
 * じゆうモード(Free Style)の出力比率モード。
 * 許容外(preset_image / 旧値 / 不正値)は Free 専用 normalizer で "source" に丸める。
 * SSR では null を返すため、呼び出し側はマウント後に復元する(初回描画は source)。
 */
export function readPreferredAspectMode(): FreeOutputAspectRatioMode {
  const stored = safeReadLocalStorage(FREE_ASPECT_MODE_STORAGE_KEY);
  return normalizeFreeOutputAspectRatioMode(stored);
}

export function writePreferredAspectMode(
  mode: FreeOutputAspectRatioMode,
): void {
  // 念のため Free 用に正規化してから保存(許容外は source)。
  safeWriteLocalStorage(
    FREE_ASPECT_MODE_STORAGE_KEY,
    normalizeFreeOutputAspectRatioMode(mode),
  );
}

/**
 * One-Tap Style(/style)の出力比率モード。Free とは別キーで記憶する。
 * 許容外("user_select" 自身 / 不正値)は "source" に丸める。
 */
export function readPreferredStyleAspectMode(): UserSelectableOutputAspectRatioMode {
  const stored = safeReadLocalStorage(STYLE_ASPECT_MODE_STORAGE_KEY);
  return normalizeUserSelectableOutputAspectRatioMode(stored);
}

export function writePreferredStyleAspectMode(
  mode: UserSelectableOutputAspectRatioMode,
): void {
  safeWriteLocalStorage(
    STYLE_ASPECT_MODE_STORAGE_KEY,
    normalizeUserSelectableOutputAspectRatioMode(mode),
  );
}

export function readCoordinateStockSavePromptDismissed(): boolean {
  return (
    safeReadLocalStorage(
      COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY
    ) === "true"
  );
}

export function writeCoordinateStockSavePromptDismissed(
  dismissed: boolean
): void {
  if (dismissed) {
    safeWriteLocalStorage(
      COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY,
      "true"
    );
    return;
  }

  safeRemoveLocalStorage(COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY);
}
