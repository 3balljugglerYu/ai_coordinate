import {
  isInvalidGeminiArgumentErrorMessage,
  isMalformedGeminiPartsErrorMessage,
  isOpenAIProviderErrorMessage,
  isSafetyPolicyBlockedErrorMessage,
} from "@/shared/generation/errors";
import type { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";

/**
 * `image_jobs.error_message` をユーザー向け文言に正規化する。
 *
 * upstream の生メッセージ（OpenAI / Gemini の英文エラー）はユーザーに見せず、
 * 既知のエラー種別を i18n コピーに差し替える。未知メッセージは passthrough する。
 *
 * Next.js 16 では route.ts ファイルから handler 以外の named export が禁じられているため、
 * 単体テスト容易性のためにこのファイルへ切り出している（route 側は import するだけ）。
 */
export function normalizeUserFacingGenerationError(
  status: string,
  errorMessage: string | null,
  copy: ReturnType<typeof getGenerationRouteCopy>,
): string | null {
  if (status !== "failed" || !errorMessage) return errorMessage;

  if (errorMessage === "No images generated") {
    return copy.noImagesGenerated;
  }

  if (isSafetyPolicyBlockedErrorMessage(errorMessage)) {
    return copy.safetyBlocked;
  }

  if (isMalformedGeminiPartsErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  if (isInvalidGeminiArgumentErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  // OpenAI 側の非リトライ系エラー（組織未検証 / API key 不正 / 残高不足 /
  // 401・403 / GIF 拒否 / OPENAI_API_KEY 未設定）は upstream の生メッセージを
  // 表に出さず汎用文言に差し替える。詳細は Edge Function ログ参照。
  if (isOpenAIProviderErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  return errorMessage;
}
