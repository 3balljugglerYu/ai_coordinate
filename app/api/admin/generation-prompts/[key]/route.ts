import { connection, NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  deletePromptOverride,
  upsertPromptOverride,
} from "@/features/generation-prompts/lib/admin-repository";
import { PROMPT_OVERRIDES_CACHE_TAG } from "@/features/generation-prompts/lib/resolve-templates";
import {
  isKnownPromptKey,
  PROMPT_REGISTRY,
  type PromptDefinition,
  type PromptKey,
} from "@/shared/generation/prompt-registry";
import { extractTemplateVariables } from "@/shared/generation/prompt-template";

const MAX_CONTENT_LENGTH = 4000;

/**
 * 編集後に変更を即時反映させるための共通リバリデーション。
 * - cacheTag: resolveAllPromptTemplates (use cache) を失効
 * - path: 一覧 + 個別編集ページの ISR を失効
 */
function revalidatePromptOverridesCache(key: string): void {
  revalidateTag(PROMPT_OVERRIDES_CACHE_TAG, "max");
  revalidatePath("/admin/generation-prompts");
  revalidatePath(`/admin/generation-prompts/${key}`);
}

/**
 * audit log の metadata には content を先頭 500 文字だけ残す (PII 保護・ログ肥大化抑止)。
 */
function snippetForAudit(content: string | null | undefined): string | null {
  if (content == null) return null;
  return content.length > 500 ? `${content.slice(0, 500)}…` : content;
}

/**
 * PUT /api/admin/generation-prompts/[key]
 * admin が prompt override を upsert する。registry に存在する key のみ受理。
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  await connection();
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { key } = await params;
  if (!isKnownPromptKey(key)) {
    return NextResponse.json(
      { error: `Unknown prompt_key: ${key}` },
      { status: 400 },
    );
  }

  // request.json() は null / 配列 / プリミティブを返し得るため、object であることを
  // 確認してから property アクセスする (defensive programming)
  let parsedBody: unknown = null;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content =
    parsedBody !== null &&
    typeof parsedBody === "object" &&
    !Array.isArray(parsedBody) &&
    typeof (parsedBody as { content?: unknown }).content === "string"
      ? (parsedBody as { content: string }).content
      : "";
  if (content.trim().length === 0) {
    return NextResponse.json(
      { error: "content must not be empty (use DELETE to reset)" },
      { status: 400 },
    );
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      {
        error: `content exceeds max length (${MAX_CONTENT_LENGTH} chars)`,
        actualLength: content.length,
      },
      { status: 400 },
    );
  }

  // 未サポートの {{varname}} を含んでいたら warning として返す (block しない)
  const def = PROMPT_REGISTRY[key as PromptKey] as PromptDefinition;
  const supported = new Set(def.supportedVariables);
  const found = extractTemplateVariables(content);
  const unknownVars = found.filter((v) => !supported.has(v));

  try {
    const { previousContent } = await upsertPromptOverride({
      key: key as PromptKey,
      content,
      userId: user.id,
    });
    revalidatePromptOverridesCache(key);
    await logAdminAction({
      adminUserId: user.id,
      actionType: "prompt_override_update",
      targetType: "prompt_override",
      targetId: key,
      metadata: {
        content_before: snippetForAudit(previousContent),
        content_after: snippetForAudit(content),
        content_length: content.length,
        unknown_variables: unknownVars,
      },
    });
    return NextResponse.json({
      ok: true,
      warnings:
        unknownVars.length > 0
          ? [
              `Unsupported variables in content: ${unknownVars
                .map((v) => `{{${v}}}`)
                .join(", ")}`,
            ]
          : [],
    });
  } catch (error) {
    console.error("[admin generation-prompts PUT] failed:", error);
    return NextResponse.json(
      { error: "Failed to update prompt override" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/generation-prompts/[key]
 * prompt override を削除して code default にリセットする。
 * registry に無い key (孤立 row) でも DB に row が存在すれば削除を許可。
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  await connection();
  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { key } = await params;

  try {
    const { previousContent } = await deletePromptOverride(key);
    if (previousContent === null && !isKnownPromptKey(key)) {
      // DB にも row が無い未知 key → 不正リクエスト
      return NextResponse.json(
        { error: `No override exists for: ${key}` },
        { status: 404 },
      );
    }
    revalidatePromptOverridesCache(key);
    await logAdminAction({
      adminUserId: user.id,
      actionType: "prompt_override_reset",
      targetType: "prompt_override",
      targetId: key,
      metadata: {
        content_before: snippetForAudit(previousContent),
        content_after: null,
        is_orphan: !isKnownPromptKey(key),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin generation-prompts DELETE] failed:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt override" },
      { status: 500 },
    );
  }
}
