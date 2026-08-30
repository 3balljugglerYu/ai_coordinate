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

/**
 * 請求まわりで生成が止まったときのメッセージか。
 *
 * 提供元は接頭辞なしの生文字列で返し、しかも**文言が変わる**。
 * 実績: 2026-07-04 と 08-02 は `Billing hard limit has been reached.`、
 * 08-31 は `You have no credits remaining.` だった。前者だけを潰していたため
 * 後者が素通りし、ユーザーに「あなたが課金してください」と読める英文と
 * 当社の請求ページ URL が表示された。
 *
 * ユーザーから見ればどれも「いま使えない・待てば直る」なので混雑扱いにする。
 */
export function isBillingBlockedErrorMessage(errorMessage: string): boolean {
  return /billing.*hard limit|hard limit.*reached|no credits remaining|insufficient[_ ]?(quota|credit|balance)|exceeded your current quota/i.test(
    errorMessage,
  );
}

const URL_IN_MESSAGE = /https?:\/\//i;
const JAPANESE_IN_MESSAGE = /[\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Han}]/u;

/**
 * 「提供元が返した生メッセージ」らしいか。**最後の関門**として使う。
 *
 * 既知パターンの列挙だけだと、提供元が文言を変えるたびに漏れる（実際に漏れた）。
 * 私たちがユーザーへ出す文言は**必ず日本語で、URL を含まない**ので、
 * それを外れたものは表に出さない。
 *
 * 未知でも日本語の文言は通す。将来こちらで足す説明が握り潰されないため。
 */
export function looksLikeUpstreamErrorMessage(errorMessage: string): boolean {
  return (
    URL_IN_MESSAGE.test(errorMessage) || !JAPANESE_IN_MESSAGE.test(errorMessage)
  );
}
