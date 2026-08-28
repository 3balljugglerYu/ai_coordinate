import { MAX_GENERATION_TIP_LENGTH } from "./generation-tip";

export interface GenerationTipOverrideFields {
  /** undefined = フォーム未送信(更新時は現状維持)。null = 明示クリア(カテゴリ設定へ継承)。 */
  generationTipJa?: string | null;
  generationTipEn?: string | null;
}

export type ParseGenerationTipOverrideResult =
  | { ok: true; value: GenerationTipOverrideFields }
  | { ok: false; error: string };

/**
 * admin スタイル編集 API の FormData から、ワンポイントアドバイスの
 * スタイル別上書きを取り出して検証する。
 *
 * 作法はユーザープロンプト入力欄の上書き(parse-user-prompt-override-fields)に揃える。
 * エントリが無ければ undefined(現状維持)、空文字は null(カテゴリ設定へ継承)。
 */
export function parseGenerationTipOverrideFields(
  formData: FormData
): ParseGenerationTipOverrideResult {
  const value: GenerationTipOverrideFields = {};

  for (const [key, field] of [
    ["generation_tip_ja", "generationTipJa"],
    ["generation_tip_en", "generationTipEn"],
  ] as const) {
    const entry = formData.get(key);
    if (entry === null) continue;
    if (typeof entry !== "string") {
      return { ok: false, error: `${key} はテキストで指定してください` };
    }
    const trimmed = entry.trim();
    if (trimmed.length > MAX_GENERATION_TIP_LENGTH) {
      return {
        ok: false,
        error: `ワンポイントアドバイスは ${MAX_GENERATION_TIP_LENGTH} 文字以内で入力してください`,
      };
    }
    value[field] = trimmed.length > 0 ? trimmed : null;
  }

  return { ok: true, value };
}
