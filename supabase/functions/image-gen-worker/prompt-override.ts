/**
 * worker (Deno) 用 prompt override resolver。
 *
 * 同等の Next.js wrapper: `features/generation-prompts/lib/resolve-templates.ts`
 *
 * 設計 (ADR-005, ADR-007):
 * - worker (Deno) でも buildSharedPrompt / buildInspirePrompt /
 *   buildStyleAttemptReinforcementPrefix が呼ばれているため、pure builder に
 *   渡す templates dict をここで生成する
 * - 全 prompt_key を 1 クエリで取得し、registry default で欠落を埋める
 * - invocation 内メモリキャッシュ: 同一 worker 実行内で複数 job を処理する場合に
 *   同じ dict を使い回す (cold start から最初の job のみ DB 取得)
 * - DB query 失敗時は registry default 100% で fallback (生成は止めない)
 */

import {
  PROMPT_KEYS,
  PROMPT_REGISTRY,
} from "../../../shared/generation/prompt-registry.ts";

export type ResolvedPromptTemplates = Record<string, string>;

interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then?: any;
    };
  };
}

let memoryCache: ResolvedPromptTemplates | null = null;
let memoryCachedAt = 0;

const MEMORY_CACHE_TTL_MS = 60_000; // 1 分。worker invocation を跨いでも短期間は使い回す

/**
 * registry default で完全に埋めた dict を返す (DB なし fallback)。
 */
function buildDefaultsOnly(): ResolvedPromptTemplates {
  const result: ResolvedPromptTemplates = {};
  for (const key of PROMPT_KEYS) {
    result[key] = PROMPT_REGISTRY[key].defaultContent;
  }
  return result;
}

/**
 * worker (Deno) 用に prompt templates の完全 dict を返す。
 *
 * @param supabase admin client (service role)
 * @param options.forceFresh true で memory cache を無視して必ず DB から取得
 */
export async function resolveAllPromptTemplatesForWorker(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  options: { forceFresh?: boolean } = {},
): Promise<ResolvedPromptTemplates> {
  if (!options.forceFresh && memoryCache != null) {
    const age = Date.now() - memoryCachedAt;
    if (age < MEMORY_CACHE_TTL_MS) {
      return memoryCache;
    }
  }

  const defaults = buildDefaultsOnly();
  try {
    const { data, error } = await supabase
      .from("prompt_overrides")
      .select("prompt_key, content");
    if (error) {
      console.error("[prompt-override worker] query failed:", error);
      memoryCache = defaults;
      memoryCachedAt = Date.now();
      return defaults;
    }
    const rows = (data ?? []) as Array<{
      prompt_key: string;
      content: string;
    }>;
    const result: ResolvedPromptTemplates = { ...defaults };
    for (const row of rows) {
      if (row.prompt_key in PROMPT_REGISTRY) {
        result[row.prompt_key] = row.content;
      }
    }
    memoryCache = result;
    memoryCachedAt = Date.now();
    return result;
  } catch (err) {
    console.error("[prompt-override worker] unexpected error:", err);
    memoryCache = defaults;
    memoryCachedAt = Date.now();
    return defaults;
  }
}

/**
 * テスト用: メモリキャッシュをクリア。
 */
export function clearWorkerPromptCache(): void {
  memoryCache = null;
  memoryCachedAt = 0;
}

// `SupabaseLike` 未使用警告抑止 (型ドキュメント用)
export type _SupabaseLikeUnused = SupabaseLike;
