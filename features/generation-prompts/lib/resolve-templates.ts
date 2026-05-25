import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getResolvedPromptTemplates } from "@/features/generation-prompts/lib/admin-repository";
import type { ResolvedPromptTemplates } from "@/features/generation-prompts/types";

export const PROMPT_OVERRIDES_CACHE_TAG = "prompt-overrides";

/**
 * Next.js 経路で生成 prompt builder に渡す resolved templates dict を取得する。
 *
 * 設計:
 * - 全 prompt_key を 1 クエリで取得し registry default で欠落を埋める (admin-repository)
 * - "use cache" + cacheTag + cacheLife("minutes") でリクエスト跨ぎキャッシュ
 * - admin の編集 API は `revalidateTag(PROMPT_OVERRIDES_CACHE_TAG, "max")` で失効
 * - DB query 失敗時は registry default 100% でフォールバック (生成は止めない)
 *
 * 詳細: docs/planning/admin-generation-prompt-editor-plan.md (ADR-006, ADR-007)
 */
export async function resolveAllPromptTemplates(): Promise<ResolvedPromptTemplates> {
  "use cache";
  cacheTag(PROMPT_OVERRIDES_CACHE_TAG);
  cacheLife("minutes");
  return getResolvedPromptTemplates();
}
