import { connection, NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  deactivatePresetCategory,
  getPresetCategoryById,
  PRESET_CATEGORY_IMAGE_INPUT_MODES,
  STYLE_PRESET_CATEGORY_VISIBILITY_VALUES,
  STYLE_OUTPUT_ASPECT_RATIO_MODES,
  updatePresetCategory,
} from "@/features/style-presets/lib/preset-category-repository";
import { parseCollectionSettings } from "../collection-settings-payload";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_DISPLAY_NAME_LENGTH = 60;
const MAX_USER_GUIDANCE_LENGTH = 1000;

function revalidatePresetCategoriesCache(id: string): void {
  revalidateTag("style-presets", "max");
  revalidatePath("/admin/preset-categories");
  revalidatePath(`/admin/preset-categories/${id}`);
  revalidatePath("/admin/style-presets");
  revalidatePath("/style");
}

/**
 * PATCH /api/admin/preset-categories/[id]
 * key 以外を更新する (key は不変。DB trigger でも拒否される)。
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  // CSRF 防御: cookie 認証 mutation route は Same-Origin Origin 検証 (REQ-14)
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;
  const existing = await getPresetCategoryById(id);
  if (!existing) {
    return NextResponse.json({ error: "category not found" }, { status: 404 });
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    parsedBody === null ||
    typeof parsedBody !== "object" ||
    Array.isArray(parsedBody)
  ) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = parsedBody as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if (body.display_name_ja !== undefined) {
    if (typeof body.display_name_ja !== "string") {
      return NextResponse.json(
        { error: "display_name_ja must be string" },
        { status: 400 },
      );
    }
    const trimmed = body.display_name_ja.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      return NextResponse.json(
        { error: `display_name_ja must be 1..${MAX_DISPLAY_NAME_LENGTH} chars` },
        { status: 400 },
      );
    }
    update.displayNameJa = trimmed;
  }
  if (body.display_name_en !== undefined) {
    if (typeof body.display_name_en !== "string") {
      return NextResponse.json(
        { error: "display_name_en must be string" },
        { status: 400 },
      );
    }
    const trimmed = body.display_name_en.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      return NextResponse.json(
        { error: `display_name_en must be 1..${MAX_DISPLAY_NAME_LENGTH} chars` },
        { status: 400 },
      );
    }
    update.displayNameEn = trimmed;
  }
  if (body.badge_color !== undefined) {
    if (
      typeof body.badge_color !== "string" ||
      !HEX_COLOR_PATTERN.test(body.badge_color)
    ) {
      return NextResponse.json(
        { error: "badge_color must be #RRGGBB" },
        { status: 400 },
      );
    }
    update.badgeColor = body.badge_color;
  }
  if (body.badge_text_color !== undefined) {
    if (
      typeof body.badge_text_color !== "string" ||
      !HEX_COLOR_PATTERN.test(body.badge_text_color)
    ) {
      return NextResponse.json(
        { error: "badge_text_color must be #RRGGBB" },
        { status: 400 },
      );
    }
    update.badgeTextColor = body.badge_text_color;
  }
  if (body.skip_base_prefix !== undefined) {
    if (typeof body.skip_base_prefix !== "boolean") {
      return NextResponse.json(
        { error: "skip_base_prefix must be boolean" },
        { status: 400 },
      );
    }
    update.skipBasePrefix = body.skip_base_prefix;
  }
  if (body.default_image_input_mode !== undefined) {
    if (
      typeof body.default_image_input_mode !== "string" ||
      !PRESET_CATEGORY_IMAGE_INPUT_MODES.includes(
        body.default_image_input_mode as "single" | "dual",
      )
    ) {
      return NextResponse.json(
        { error: "default_image_input_mode must be 'single' or 'dual'" },
        { status: 400 },
      );
    }
    update.defaultImageInputMode = body.default_image_input_mode as
      | "single"
      | "dual";
  }
  if (body.output_aspect_ratio_mode !== undefined) {
    if (
      typeof body.output_aspect_ratio_mode !== "string" ||
      !STYLE_OUTPUT_ASPECT_RATIO_MODES.includes(
        body.output_aspect_ratio_mode as "source" | "square",
      )
    ) {
      return NextResponse.json(
        { error: "output_aspect_ratio_mode must be 'source' or 'square'" },
        { status: 400 },
      );
    }
    update.outputAspectRatioMode = body.output_aspect_ratio_mode as
      | "source"
      | "square";
  }
  if (body.user_guidance_ja !== undefined) {
    if (
      body.user_guidance_ja !== null &&
      typeof body.user_guidance_ja !== "string"
    ) {
      return NextResponse.json(
        { error: "user_guidance_ja must be string or null" },
        { status: 400 },
      );
    }
    const trimmed =
      typeof body.user_guidance_ja === "string"
        ? body.user_guidance_ja.trim()
        : "";
    if (trimmed.length > MAX_USER_GUIDANCE_LENGTH) {
      return NextResponse.json(
        { error: `user_guidance_ja must be <= ${MAX_USER_GUIDANCE_LENGTH} chars` },
        { status: 400 },
      );
    }
    update.userGuidanceJa = trimmed.length > 0 ? trimmed : null;
  }
  if (body.user_guidance_en !== undefined) {
    if (
      body.user_guidance_en !== null &&
      typeof body.user_guidance_en !== "string"
    ) {
      return NextResponse.json(
        { error: "user_guidance_en must be string or null" },
        { status: 400 },
      );
    }
    const trimmed =
      typeof body.user_guidance_en === "string"
        ? body.user_guidance_en.trim()
        : "";
    if (trimmed.length > MAX_USER_GUIDANCE_LENGTH) {
      return NextResponse.json(
        { error: `user_guidance_en must be <= ${MAX_USER_GUIDANCE_LENGTH} chars` },
        { status: 400 },
      );
    }
    update.userGuidanceEn = trimmed.length > 0 ? trimmed : null;
  }
  if (body.show_source_image_type_control !== undefined) {
    if (typeof body.show_source_image_type_control !== "boolean") {
      return NextResponse.json(
        { error: "show_source_image_type_control must be boolean" },
        { status: 400 },
      );
    }
    update.showSourceImageTypeControl = body.show_source_image_type_control;
  }
  if (body.show_background_change_control !== undefined) {
    if (typeof body.show_background_change_control !== "boolean") {
      return NextResponse.json(
        { error: "show_background_change_control must be boolean" },
        { status: 400 },
      );
    }
    update.showBackgroundChangeControl = body.show_background_change_control;
  }
  if (body.show_generation_model_control !== undefined) {
    if (typeof body.show_generation_model_control !== "boolean") {
      return NextResponse.json(
        { error: "show_generation_model_control must be boolean" },
        { status: 400 },
      );
    }
    update.showGenerationModelControl = body.show_generation_model_control;
  }
  if (body.show_user_prompt_input !== undefined) {
    if (typeof body.show_user_prompt_input !== "boolean") {
      return NextResponse.json(
        { error: "show_user_prompt_input must be boolean" },
        { status: 400 },
      );
    }
    update.showUserPromptInput = body.show_user_prompt_input;
  }
  if (body.visibility !== undefined) {
    if (
      typeof body.visibility !== "string" ||
      !STYLE_PRESET_CATEGORY_VISIBILITY_VALUES.includes(
        body.visibility as "public" | "admin_only",
      )
    ) {
      return NextResponse.json(
        { error: "visibility must be 'public' or 'admin_only'" },
        { status: 400 },
      );
    }
    update.visibility = body.visibility as "public" | "admin_only";
  }
  if (body.display_order !== undefined) {
    if (
      typeof body.display_order !== "number" ||
      !Number.isFinite(body.display_order) ||
      body.display_order < 0
    ) {
      return NextResponse.json(
        { error: "display_order must be a non-negative number" },
        { status: 400 },
      );
    }
    update.displayOrder = Math.floor(body.display_order);
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active must be boolean" },
        { status: 400 },
      );
    }
    update.isActive = body.is_active;
  }

  // コレクション設定(既存値とマージして R-02 を検証)
  const collectionResult = parseCollectionSettings(body, {
    isCollectionSeries: existing.isCollectionSeries,
    completionThreshold: existing.completionThreshold,
    mountTemplatePath: existing.mountTemplatePath,
    mountLayout: existing.mountLayout,
  });
  if (!collectionResult.ok) {
    return NextResponse.json({ error: collectionResult.error }, { status: 400 });
  }
  Object.assign(update, collectionResult.payload);

  try {
    const updated = await updatePresetCategory(id, {
      ...(update as Parameters<typeof updatePresetCategory>[1]),
      updatedBy: user.id,
    });
    revalidatePresetCategoriesCache(id);
    await logAdminAction({
      adminUserId: user.id,
      actionType: "preset_category_update",
      targetType: "preset_category",
      targetId: id,
      metadata: {
        key: updated.key,
        changes: Object.keys(update),
        is_active_before: existing.isActive,
        is_active_after: updated.isActive,
      },
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("preset_categories.key is immutable")) {
      return NextResponse.json(
        { error: "key is immutable" },
        { status: 400 },
      );
    }
    console.error("[admin preset-categories PATCH] failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/preset-categories/[id]
 * 物理削除はせず is_active=false に倒すソフトデリート。
 * (既存 preset との FK 整合性 + 過去ジョブのスナップショット集計を壊さないため)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  // CSRF 防御: cookie 認証 mutation route は Same-Origin Origin 検証 (REQ-14)
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let user: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;
  const existing = await getPresetCategoryById(id);
  if (!existing) {
    return NextResponse.json({ error: "category not found" }, { status: 404 });
  }

  try {
    const updated = await deactivatePresetCategory(id, user.id);
    revalidatePresetCategoriesCache(id);
    await logAdminAction({
      adminUserId: user.id,
      actionType: "preset_category_deactivate",
      targetType: "preset_category",
      targetId: id,
      metadata: {
        key: updated.key,
        was_active_before: existing.isActive,
      },
    });
    return NextResponse.json({ ok: true, item: updated });
  } catch (error) {
    console.error("[admin preset-categories DELETE] failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
