/**
 * /style の生成で使うモデルの入力値。API に送る名前ではない。
 * `normalizeModelName()` で DB の保存名(`gemini-3.1-flash-image-preview-512`)へ寄せて使う。
 * Gemini API に送る名前は `GEMINI_API_MODEL_NAMES`(shared/generation/gemini-banana-model.ts)。
 */
export const STYLE_GENERATION_MODEL = "gemini-3.1-flash-image-preview" as const;
export const STYLE_GENERATION_IMAGE_SIZE = "512" as const;
