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
import {
  GEMINI_API_MODEL_NAMES,
  type GeminiApiModel,
} from "../../../shared/generation/gemini-banana-model.ts";

export type GeminiImageSize = "512" | "1K" | "2K" | "4K";

export interface BuildGeminiGenerationConfigInput {
  /** API モデルが対応する離散サイズラベル。`gemini-2.5-flash-image` 等では null */
  imageSize: GeminiImageSize | null;
  /** `resolveGeminiAspectRatio()` で解決した出力アスペクト比 */
  aspectRatio: GeminiAspectRatio;
  /**
   * Nano 2(`gemini-3.1-flash-image`)は `candidateCount: 1` と
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
 *   (Nano 2 = `gemini-3.1-flash-image` のみ true。`getGeminiRequestShape` を参照)
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

export interface GeminiRequestShape {
  /** imageSize が無いジョブを受けたら失敗させる */
  requiresImageSize: boolean;
  /** `imageConfig.imageSize` を送る(送らないモデルでも aspectRatio は送る) */
  sendsImageSize: boolean;
  /** `candidateCount: 1` と `responseModalities` を付ける */
  requiresResponseModalities: boolean;
}

/**
 * API モデルごとのリクエストの形。worker が apiModel を文字列で比べていた 4 か所を
 * ここへ集めた。プレビュー名から GA 名へ置き換えたときも、形は変えていない。
 *
 * - Nano 2: imageSize 必須・candidateCount / responseModalities あり
 * - Pro: imageSize があれば送る・responseModalities なし
 * - gemini-2.5-flash-image: どちらも送らない
 */
export function getGeminiRequestShape(apiModel: GeminiApiModel): GeminiRequestShape {
  const isNano2 = apiModel === GEMINI_API_MODEL_NAMES.nano2;
  return {
    requiresImageSize: isNano2,
    sendsImageSize: isNano2 || apiModel === GEMINI_API_MODEL_NAMES.pro,
    requiresResponseModalities: isNano2,
  };
}
