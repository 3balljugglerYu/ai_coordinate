/**
 * OpenAI gpt-image-2 関連の共有型。
 *
 * Next.js（`features/generation/lib/openai-image.ts`）と Supabase Deno Worker
 * （`supabase/functions/image-gen-worker/openai-image.ts`）の両方から import する。
 * 既存パターン: `shared/generation/errors.ts` と同じく、新しい OpenAI 共有型は
 * ここに集約する（既存の重複型 `OpenAITargetSize` / `OpenAIImageInput` 等の整理は
 * スコープ別 PR で扱う）。
 */

/**
 * OpenAI gpt-image-2 の `quality` パラメータ。
 *
 * - "low": 最も高速・低コスト（既定）
 * - "medium": 中品質（inspire のように合成難度が高い経路で指定）
 * - "high": 最高品質・高コスト
 * - "auto": OpenAI に自動選択させる
 */
export type OpenAIImageQuality = "low" | "medium" | "high" | "auto";

/**
 * `/v1/images/edits` レスポンスの `usage`(トークン消費)。
 *
 * 実原価の突合(2.0 と 2.5 の paired run)に使う。レスポンス単位の値なので、
 * 同一呼び出しで複数枚返った場合も全要素で同じ値になる。
 * base64 など画像データは絶対に含めない(ログ・DB へそのまま書けるサイズに保つ)。
 */
export interface OpenAIImageUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** 入力トークンの内訳(text / image)。API が返さなければ null */
  inputTokensDetails: {
    textTokens: number;
    imageTokens: number;
  } | null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * OpenAI レスポンスの `usage` を安全に読み取る。
 *
 * - `input_tokens` / `output_tokens` が数値でなければ null(記録しない)
 * - `total_tokens` が無ければ input + output で補う
 * - `input_tokens_details` は text/image の両方が数値のときだけ採用する
 */
export function parseOpenAIImageUsage(value: unknown): OpenAIImageUsage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const inputTokens = readFiniteNumber(raw.input_tokens);
  const outputTokens = readFiniteNumber(raw.output_tokens);
  if (inputTokens === null || outputTokens === null) {
    return null;
  }
  const totalTokens =
    readFiniteNumber(raw.total_tokens) ?? inputTokens + outputTokens;

  let inputTokensDetails: OpenAIImageUsage["inputTokensDetails"] = null;
  const details = raw.input_tokens_details;
  if (details && typeof details === "object") {
    const detailsRecord = details as Record<string, unknown>;
    const textTokens = readFiniteNumber(detailsRecord.text_tokens);
    const imageTokens = readFiniteNumber(detailsRecord.image_tokens);
    if (textTokens !== null && imageTokens !== null) {
      inputTokensDetails = { textTokens, imageTokens };
    }
  }

  return { inputTokens, outputTokens, totalTokens, inputTokensDetails };
}
