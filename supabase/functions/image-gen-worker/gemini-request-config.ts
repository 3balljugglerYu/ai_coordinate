/**
 * Gemini API の `generationConfig` 断片を組み立てる pure helper。
 *
 * worker 本体 (Deno) から呼び出して request body の `generationConfig` を構築する。
 * worker 本体は 2500+ 行で起動コストが大きいため、この helper を分離して Jest
 * からも単体テストできるようにする。
 *
 * Deno / Jest 双方で動くよう、ランタイム依存 (Deno API / supabase client) は持たない。
 *
 * 計画書: docs/planning/image-output-aspect-ratio-clamp-plan.md (ADR-004)
 */

import type { GeminiAspectRatio } from "../../../shared/generation/gemini-aspect-ratio.ts";

export type GeminiImageSize = "512" | "1K" | "2K" | "4K";

export interface BuildGeminiGenerationConfigInput {
  /** API モデルが対応する離散サイズラベル。`gemini-2.5-flash-image` 等では null */
  imageSize: GeminiImageSize | null;
  /** `resolveGeminiAspectRatio()` で解決した出力アスペクト比 */
  aspectRatio: GeminiAspectRatio;
  /**
   * `gemini-3.1-flash-image-preview` 系は `candidateCount: 1` と
   * `responseModalities: ["TEXT", "IMAGE"]` も必要。それ以外のモデルでは不要。
   */
  requiresResponseModalities?: boolean;
}

export interface GeminiGenerationConfigPiece {
  candidateCount?: number;
  responseModalities?: Array<"TEXT" | "IMAGE">;
  imageConfig: {
    imageSize?: GeminiImageSize;
    aspectRatio: GeminiAspectRatio;
  };
}

/**
 * Gemini request body の `generationConfig` 断片を組み立てる。
 *
 * - `imageSize` が null でも `imageConfig.aspectRatio` は必ず含める。
 *   (`gemini-2.5-flash-image` のように imageSize を持たないモデルでも aspectRatio 指定が必要)
 * - `requiresResponseModalities=true` のときは `candidateCount` と `responseModalities` も付与。
 *   (`gemini-3.1-flash-image-preview` 系のみ true)
 */
export function buildGeminiGenerationConfig(
  input: BuildGeminiGenerationConfigInput,
): GeminiGenerationConfigPiece {
  const imageConfig: GeminiGenerationConfigPiece["imageConfig"] = {
    aspectRatio: input.aspectRatio,
  };
  if (input.imageSize != null) {
    imageConfig.imageSize = input.imageSize;
  }

  const piece: GeminiGenerationConfigPiece = { imageConfig };
  if (input.requiresResponseModalities) {
    piece.candidateCount = 1;
    piece.responseModalities = ["TEXT", "IMAGE"];
  }
  return piece;
}
