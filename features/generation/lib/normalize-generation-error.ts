import {
  containsCredentialReference,
  isBillingBlockedErrorMessage,
  looksLikeUpstreamErrorMessage,
  GEMINI_DISABLED_MESSAGE,
  isInvalidGeminiArgumentErrorMessage,
  isGeminiProviderErrorMessage,
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

  // kill switch による Gemini 停止は「別モデルを選んでください」と案内する
  // （`gemini_provider_error: ...` プレフィックスを共有するため、必ず
  // isGeminiProviderErrorMessage 判定より前に評価する）。
  if (errorMessage.includes(GEMINI_DISABLED_MESSAGE)) {
    return copy.modelTemporarilyUnavailable;
  }

  if (
    isGeminiProviderErrorMessage(errorMessage) ||
    containsCredentialReference(errorMessage)
  ) {
    return copy.genericGenerationFailed;
  }

  // 請求上限到達・残高切れ。内部事情(請求)を出さず「混雑」として案内する。
  // 提供元はタグ無しの生メッセージで返し、しかも文言が変わる(判定は共有関数)。
  if (isBillingBlockedErrorMessage(errorMessage)) {
    return copy.providerBusy;
  }

  // OpenAI 側の非リトライ系エラー（組織未検証 / API key 不正 / 残高不足 /
  // 401・403 / GIF 拒否 / OPENAI_API_KEY 未設定）は upstream の生メッセージを
  // 表に出さず汎用文言に差し替える。詳細は Edge Function ログ参照。
  if (isOpenAIProviderErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  /*
    最後の関門。既知パターンの列挙だけだと、提供元が文言を変えるたびに漏れる。
    2026-08-31 の障害では `You have no credits remaining. ... https://platform.openai.com/...`
    がそのまま表示され、ユーザーには「あなたが課金してください」と読めた。
    日本語でない、または URL を含むメッセージは提供元由来と見なして伏せる。

    生メッセージは image_jobs.error_message にそのまま残るので、調査は従来どおり
    できる（今回の原因特定もそこから行った）。伏せるのは表示だけ。
  */
  if (looksLikeUpstreamErrorMessage(errorMessage)) {
    return copy.genericGenerationFailed;
  }

  return errorMessage;
}
