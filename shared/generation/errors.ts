/**
 * 画像生成関連の共通エラー定義
 * Next.js 側と Supabase Edge Function 側で共有する。
 */

export const MALFORMED_GEMINI_PARTS_ERROR =
  "candidate.content.parts is not iterable";

export function isMalformedGeminiPartsErrorMessage(
  errorMessage: string
): boolean {
  return errorMessage.toLowerCase().includes(MALFORMED_GEMINI_PARTS_ERROR);
}
