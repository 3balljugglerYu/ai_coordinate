import { GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";

/** ラベルの最大文字数(カテゴリ API `app/api/admin/preset-categories` と同一基準)。 */
export const MAX_USER_PROMPT_LABEL_LENGTH = 120;
/** placeholder の最大文字数(カテゴリ API と同一基準)。 */
export const MAX_USER_PROMPT_PLACEHOLDER_LENGTH = 200;

export interface UserPromptOverrideFields {
  /** undefined = フォーム未送信(更新時は現状維持)。null = 明示クリア(カテゴリ設定へ継承)。 */
  userPromptLabel?: string | null;
  userPromptPlaceholder?: string | null;
  userPromptMaxLength?: number | null;
}

export type ParseUserPromptOverrideResult =
  | { ok: true; value: UserPromptOverrideFields }
  | { ok: false; error: string };

/**
 * admin スタイル編集 API (POST/PATCH) の FormData から、ユーザープロンプト入力欄の
 * スタイル別上書き 3 項目を取り出して検証する。
 *
 * - エントリ自体が無い場合は undefined を返し、更新時は現状維持になる
 *   (旧フォームキャッシュからの送信でも既存値を壊さない)。
 * - 空文字(trim 後)は null = 明示クリア(カテゴリ設定へ継承)。
 * - 検証基準はカテゴリ API と同一: ラベル <=120 / placeholder <=200 /
 *   最大文字数は 1〜GENERATION_PROMPT_MAX_LENGTH(1500) の整数。
 */
export function parseUserPromptOverrideFields(
  formData: FormData,
): ParseUserPromptOverrideResult {
  const value: UserPromptOverrideFields = {};

  const labelEntry = formData.get("user_prompt_label");
  if (labelEntry !== null) {
    if (typeof labelEntry !== "string") {
      return { ok: false, error: "user_prompt_label はテキストで指定してください" };
    }
    const trimmed = labelEntry.trim();
    if (trimmed.length > MAX_USER_PROMPT_LABEL_LENGTH) {
      return {
        ok: false,
        error: `ラベルは ${MAX_USER_PROMPT_LABEL_LENGTH} 文字以内で入力してください`,
      };
    }
    value.userPromptLabel = trimmed.length > 0 ? trimmed : null;
  }

  const placeholderEntry = formData.get("user_prompt_placeholder");
  if (placeholderEntry !== null) {
    if (typeof placeholderEntry !== "string") {
      return {
        ok: false,
        error: "user_prompt_placeholder はテキストで指定してください",
      };
    }
    const trimmed = placeholderEntry.trim();
    if (trimmed.length > MAX_USER_PROMPT_PLACEHOLDER_LENGTH) {
      return {
        ok: false,
        error: `プレースホルダは ${MAX_USER_PROMPT_PLACEHOLDER_LENGTH} 文字以内で入力してください`,
      };
    }
    value.userPromptPlaceholder = trimmed.length > 0 ? trimmed : null;
  }

  const maxLengthEntry = formData.get("user_prompt_max_length");
  if (maxLengthEntry !== null) {
    if (typeof maxLengthEntry !== "string") {
      return {
        ok: false,
        error: "user_prompt_max_length は数値で指定してください",
      };
    }
    const trimmed = maxLengthEntry.trim();
    if (trimmed.length === 0) {
      value.userPromptMaxLength = null;
    } else {
      const parsed = Number(trimmed);
      if (
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > GENERATION_PROMPT_MAX_LENGTH
      ) {
        return {
          ok: false,
          error: `最大文字数は 1〜${GENERATION_PROMPT_MAX_LENGTH} の整数で指定してください`,
        };
      }
      value.userPromptMaxLength = parsed;
    }
  }

  return { ok: true, value };
}
