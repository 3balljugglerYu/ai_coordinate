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
  parseNanoBanana21Model,
  type GeminiApiModel,
  type NanoBanana21ThinkingLevel,
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
  /**
   * Nano Banana 2.1 の考える量。2.1 以外は null / 省略(thinkingConfig を付けない)。
   * Phase 0(2026-10-22)で、小文字のまま `thinkingConfig.thinkingLevel` に送ると通ることを確認済み。
   */
  thinkingLevel?: NanoBanana21ThinkingLevel | null;
}

export interface GeminiGenerationConfigPiece {
  candidateCount?: number;
  responseModalities?: Array<"TEXT" | "IMAGE">;
  imageConfig: {
    imageSize?: GeminiImageSize;
    aspectRatio: GeminiAspectRatio;
  };
  thinkingConfig?: { thinkingLevel: NanoBanana21ThinkingLevel };
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
  if (input.thinkingLevel) {
    piece.thinkingConfig = { thinkingLevel: input.thinkingLevel };
  }
  return piece;
}

/** 保存名から 2.1 の考える量を取り出す。2.1 以外は null(REQ-007) */
export function resolveNanoBanana21ThinkingLevel(
  dbModel: string,
): NanoBanana21ThinkingLevel | null {
  return parseNanoBanana21Model(dbModel)?.thinkingLevel ?? null;
}

const NANO_BANANA_2_1_REQUEST_TIMEOUT_MS = {
  "1k": 120_000,
  "2k": 180_000,
  "4k": 300_000,
} as const;

/**
 * 2.1 の 1 回の呼び出しのタイムアウト(計画書 ADR-007 の初期値・品質によらずサイズで決める)。
 * Phase 0 の実測はどれも 26 秒以内なので余裕がある。本番の p90 を見て絞る。
 * 2.1 以外は null(呼び出し側の既存の表を使う)。
 */
export function resolveNanoBanana21RequestTimeoutMs(dbModel: string): number | null {
  const parsed = parseNanoBanana21Model(dbModel);
  return parsed ? NANO_BANANA_2_1_REQUEST_TIMEOUT_MS[parsed.sizeTier] : null;
}

export interface GeminiUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  /** 考えた分。minimal など考えないときは API が項目を返さないので 0 にする */
  thoughtsTokenCount: number;
  totalTokenCount: number | null;
}

function readTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Gemini のレスポンスから `usageMetadata` を読む(REQ-008)。
 * 原価の実測(計画書 Phase 6-C)に使うので、ジョブの geminiAttempts に残す。
 * 入力・出力のトークン数が読めなければ null。
 */
export function parseGeminiUsageMetadata(payload: unknown): GeminiUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as { usageMetadata?: unknown }).usageMetadata;
  if (!usage || typeof usage !== "object") return null;
  const raw = usage as Record<string, unknown>;
  const promptTokenCount = readTokenCount(raw.promptTokenCount);
  const candidatesTokenCount = readTokenCount(raw.candidatesTokenCount);
  if (promptTokenCount === null || candidatesTokenCount === null) return null;
  return {
    promptTokenCount,
    candidatesTokenCount,
    thoughtsTokenCount: readTokenCount(raw.thoughtsTokenCount) ?? 0,
    totalTokenCount: readTokenCount(raw.totalTokenCount),
  };
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
 * - Nano 2 / 2.1: imageSize 必須・candidateCount / responseModalities あり
 * - Pro: imageSize があれば送る・responseModalities なし
 * - gemini-2.5-flash-image: どちらも送らない
 */
export function getGeminiRequestShape(apiModel: GeminiApiModel): GeminiRequestShape {
  // GEMINI_API_MODEL_NAMES に名前を足したら、ここで形を決めないと型エラーになる
  // (足し忘れると imageSize が送られず、4K を選んでも 1K で返る)。
  switch (apiModel) {
    case GEMINI_API_MODEL_NAMES.nano2:
    // 2.1 は Nano 2 と同じ形。Phase 0(2026-10-22)で 1K / 2K / 4K とも通ることを確認済み
    case GEMINI_API_MODEL_NAMES.nano21:
      return { requiresImageSize: true, sendsImageSize: true, requiresResponseModalities: true };
    case GEMINI_API_MODEL_NAMES.pro:
      return { requiresImageSize: false, sendsImageSize: true, requiresResponseModalities: false };
    case GEMINI_API_MODEL_NAMES.legacyFlash:
      return { requiresImageSize: false, sendsImageSize: false, requiresResponseModalities: false };
    default: {
      const unhandled: never = apiModel;
      throw new Error(`getGeminiRequestShape: unknown Gemini API model: ${String(unhandled)}`);
    }
  }
}
