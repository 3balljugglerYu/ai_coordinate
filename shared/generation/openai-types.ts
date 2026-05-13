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
