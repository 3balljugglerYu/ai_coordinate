/**
 * 画像生成関連の共通エラー定義
 * Next.js 側と Supabase Edge Function 側で共有する。
 */

export const MALFORMED_GEMINI_PARTS_ERROR =
  "candidate.content.parts is not iterable";
export const SAFETY_POLICY_BLOCKED_ERROR = "safety_policy_blocked";
export const INVALID_GEMINI_ARGUMENT_ERROR = "request contains an invalid argument";
/**
 * Gemini / Google API 側の構成不備に起因する非リトライ系エラー。
 * 実際の upstream メッセージはこのプレフィックスの後に付与するが、
 * ユーザー表示時は汎用メッセージに差し替える。
 */
export const GEMINI_PROVIDER_ERROR = "gemini_provider_error";
/**
 * Gemini kill switch（GEMINI_GENERATION_ENABLED=false）が ON のときに
 * worker / API ハンドラから投げる固定メッセージ。worker と Next.js 側の
 * 双方が同じ文字列で判定するため、normalizer が「モデル一時利用不可」
 * 文言に差し替えられる。GEMINI_PROVIDER_ERROR の suffix として組み合わせて使う。
 */
export const GEMINI_DISABLED_MESSAGE = "Gemini generation is temporarily disabled";
/**
 * OpenAI 側の構成不備に起因する非リトライ系エラー。
 * 例: 組織未検証 / API key 不正 / 残高不足 / 401 / 403 等。
 * 実際の upstream メッセージはこのプレフィックスの後に付与する。
 */
export const OPENAI_PROVIDER_ERROR = "openai_provider_error";

const GOOGLE_API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{20,}/g;
const GOOGLE_API_KEY_CONSUMER_PATTERN = /api_key:[^'"\s)]+/gi;

export function sanitizeProviderErrorMessage(errorMessage: string): string {
  return errorMessage
    .replace(GOOGLE_API_KEY_PATTERN, "AIza[REDACTED]")
    .replace(GOOGLE_API_KEY_CONSUMER_PATTERN, "api_key:[REDACTED]");
}

export function containsCredentialReference(errorMessage: string): boolean {
  return (
    /AIza[0-9A-Za-z_-]{20,}/.test(errorMessage) ||
    /api_key:/i.test(errorMessage)
  );
}

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

export function isGeminiProviderErrorMessage(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes(GEMINI_PROVIDER_ERROR) ||
    normalized.includes("consumer 'api_key:") ||
    (normalized.includes("permission denied") &&
      normalized.includes("has been suspended"))
  );
}

export function isOpenAIProviderErrorMessage(errorMessage: string): boolean {
  return errorMessage.toLowerCase().includes(OPENAI_PROVIDER_ERROR);
}
