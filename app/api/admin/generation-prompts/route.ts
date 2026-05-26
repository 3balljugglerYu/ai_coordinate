import { connection, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAllPromptOverrides } from "@/features/generation-prompts/lib/admin-repository";
import {
  PROMPT_REGISTRY,
  PROMPT_KEYS,
  type PromptDefinition,
  type PromptKey,
} from "@/shared/generation/prompt-registry";

/**
 * GET /api/admin/generation-prompts
 *
 * registry の全 key と DB override 行をマージして admin 一覧用の payload を返す。
 * registry に無い DB row は「孤立 row」として別配列で返す (admin UI で削除リンク表示用)。
 */
export async function GET() {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  try {
    const overrides = await listAllPromptOverrides();
    const overrideMap = new Map(overrides.map((r) => [r.prompt_key, r]));

    // registry に存在する key
    const registered = PROMPT_KEYS.map((key) => {
      const def = PROMPT_REGISTRY[key] as PromptDefinition;
      const row = overrideMap.get(key) ?? null;
      return {
        prompt_key: key,
        category: def.category,
        description: def.description,
        default_content: def.defaultContent,
        supported_variables: def.supportedVariables,
        preview_samples: def.previewSamples ?? null,
        override: row
          ? {
              content: row.content,
              updated_at: row.updated_at,
              updated_by: row.updated_by,
              created_at: row.created_at,
              created_by: row.created_by,
            }
          : null,
      };
    });

    // registry に無いが DB に row がある = 孤立 (registry リネーム後の残骸など)
    const orphans = overrides
      .filter((r) => !(r.prompt_key in PROMPT_REGISTRY))
      .map((r) => ({
        prompt_key: r.prompt_key,
        content: r.content,
        updated_at: r.updated_at,
        updated_by: r.updated_by,
      }));

    return NextResponse.json({ items: registered, orphans });
  } catch (error) {
    console.error("[admin generation-prompts GET] failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// `import type` 用 (PromptKey はクライアントから参照可能)
export type _PromptKeyType = PromptKey;
