/**
 * 画像生成関連の共通エラー定義
 * Next.js 側と Supabase Edge Function 側で共有する。
 */

export const MALFORMED_GEMINI_PARTS_ERROR =
  "candidate.content.parts is not iterable";
export const SAFETY_POLICY_BLOCKED_ERROR = "safety_policy_blocked";
export const INVALID_GEMINI_ARGUMENT_ERROR = "request contains an invalid argument";
/**
 * OpenAI 側の構成不備に起因する非リトライ系エラー。
 * 例: 組織未検証 / API key 不正 / 残高不足 / 401 / 403 等。
 * 実際の upstream メッセージはこのプレフィックスの後に付与する。
 */
export const OPENAI_PROVIDER_ERROR = "openai_provider_error";

export function isMalformedGeminiPartsErrorMessage(
  errorMessage: string
): boolean {
  return errorMessage.toLowerCase().includes(MALFORMED_GEMINI_PARTS_ERROR);
}

export function isSafetyPolicyBlockedErrorMessage(
  errorMessage: string
): boolean {
  return errorMessage.toLowerCase().includes(SAFETY_POLICY_BLOCKED_ERROR);
}

export function isInvalidGeminiArgumentErrorMessage(
  errorMessage: string
): boolean {
  return errorMessage.toLowerCase().includes(INVALID_GEMINI_ARGUMENT_ERROR);
}

export function isOpenAIProviderErrorMessage(errorMessage: string): boolean {
  return errorMessage.toLowerCase().includes(OPENAI_PROVIDER_ERROR);
}
