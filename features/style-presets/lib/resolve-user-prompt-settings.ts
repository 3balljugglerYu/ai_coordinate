import { GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";

/**
 * /style のユーザープロンプト入力欄設定(ラベル/placeholder/最大文字数)の
 * 3 段フォールバック解決: プリセット設定 → カテゴリ設定 → 既定。
 *
 * UI(StylePageClient の textarea 描画)とサーバー(生成 handler の長さ検証)の
 * 両方がこのヘルパーを使うことで、同じ解決順を共有する。
 * 表示 ON/OFF 自体(category.showUserPromptInput)はここでは扱わない。
 */
interface UserPromptSettingsSource {
  userPromptLabel?: string | null;
  userPromptPlaceholder?: string | null;
  userPromptMaxLength?: number | null;
  category: {
    userPromptLabel?: string | null;
    userPromptPlaceholder?: string | null;
    userPromptMaxLength?: number | null;
  };
}

/** ラベルの解決。null = 呼び出し側で i18n 既定(userPromptLabel)を使う。 */
export function resolveUserPromptLabel(
  preset: UserPromptSettingsSource,
): string | null {
  return preset.userPromptLabel ?? preset.category.userPromptLabel ?? null;
}

/** placeholder の解決。null = 呼び出し側で i18n 既定(userPromptPlaceholder)を使う。 */
export function resolveUserPromptPlaceholder(
  preset: UserPromptSettingsSource,
): string | null {
  return (
    preset.userPromptPlaceholder ?? preset.category.userPromptPlaceholder ?? null
  );
}

/** 最大文字数の解決。未設定は既定 1500(GENERATION_PROMPT_MAX_LENGTH)。 */
export function resolveUserPromptMaxLength(
  preset: UserPromptSettingsSource,
): number {
  return (
    preset.userPromptMaxLength ??
    preset.category.userPromptMaxLength ??
    GENERATION_PROMPT_MAX_LENGTH
  );
}
