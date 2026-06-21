import { connection, NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createPresetCategory,
  listPresetCategories,
  PRESET_CATEGORY_IMAGE_INPUT_MODES,
  STYLE_PRESET_CATEGORY_VISIBILITY_VALUES,
} from "@/features/style-presets/lib/preset-category-repository";
import {
  isStyleOutputAspectRatioMode,
  type StyleOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";
import { parseCollectionSettings } from "./collection-settings-payload";
import type { MountLayoutKey } from "@/features/collections/lib/mount-layouts";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/lib/generation/prompt-validation";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_DISPLAY_NAME_LENGTH = 60;
const MAX_USER_GUIDANCE_LENGTH = 1000;
const MAX_USER_PROMPT_LABEL_LENGTH = 120;
const MAX_USER_PROMPT_PLACEHOLDER_LENGTH = 200;

function revalidatePresetCategoriesCache(): void {
  // style preset の表示 cacheTag を流用 (preset → category の JOIN 結果が更新される)
  revalidateTag("style-presets", "max");
  revalidatePath("/admin/preset-categories");
  revalidatePath("/admin/style-presets");
  revalidatePath("/style");
}

/**
 * GET /api/admin/preset-categories
 * クエリ `include_inactive=1` で inactive も含めて返す。デフォルトは active のみ。
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const includeInactive =
    request.nextUrl.searchParams.get("include_inactive") === "1";

  try {
    const items = await listPresetCategories({ includeInactive });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("[admin preset-categories GET] failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

interface ParsedCreatePayload {
  key: string;
  displayNameJa: string;
  displayNameEn: string;
  badgeColor?: string;
  badgeTextColor?: string;
  skipBasePrefix?: boolean;
  defaultImageInputMode?: "single" | "dual";
  outputAspectRatioMode?: StyleOutputAspectRatioMode;
  userGuidanceJa?: string | null;
  userGuidanceEn?: string | null;
  showSourceImageTypeControl?: boolean;
  showBackgroundChangeControl?: boolean;
  showGenerationModelControl?: boolean;
  showUserPromptInput?: boolean;
  userPromptLabel?: string | null;
  userPromptPlaceholder?: string | null;
  userPromptMaxLength?: number | null;
  visibility?: "public" | "admin_only";
  isCollectionSeries?: boolean;
  completionThreshold?: number | null;
  mountTemplatePath?: string | null;
  mountLayout?: MountLayoutKey | null;
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * POST /api/admin/preset-categories
 * 新規 category を作成する。key は不変 (作成時にだけ決められる)。
 */
export async function POST(request: NextRequest) {
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

  // 必須フィールド + バリデーション
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const displayNameJa =
    typeof body.display_name_ja === "string" ? body.display_name_ja.trim() : "";
  const displayNameEn =
    typeof body.display_name_en === "string" ? body.display_name_en.trim() : "";

  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json(
      { error: "key must match /^[a-z][a-z0-9_]{1,49}$/" },
      { status: 400 },
    );
  }
  if (
    displayNameJa.length === 0 ||
    displayNameJa.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    return NextResponse.json(
      { error: `display_name_ja must be 1..${MAX_DISPLAY_NAME_LENGTH} chars` },
      { status: 400 },
    );
  }
  if (
    displayNameEn.length === 0 ||
    displayNameEn.length > MAX_DISPLAY_NAME_LENGTH
  ) {
    return NextResponse.json(
      { error: `display_name_en must be 1..${MAX_DISPLAY_NAME_LENGTH} chars` },
      { status: 400 },
    );
  }

  const payload: ParsedCreatePayload = {
    key,
    displayNameJa,
    displayNameEn,
  };

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
    payload.badgeColor = body.badge_color;
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
    payload.badgeTextColor = body.badge_text_color;
  }
  if (body.skip_base_prefix !== undefined) {
    if (typeof body.skip_base_prefix !== "boolean") {
      return NextResponse.json(
        { error: "skip_base_prefix must be boolean" },
        { status: 400 },
      );
    }
    payload.skipBasePrefix = body.skip_base_prefix;
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
    payload.defaultImageInputMode = body.default_image_input_mode as
      | "single"
      | "dual";
  }
  if (body.output_aspect_ratio_mode !== undefined) {
    // 後方互換: 旧 "square" は "1:1" として受け付ける。
    const mode =
      body.output_aspect_ratio_mode === "square"
        ? "1:1"
        : body.output_aspect_ratio_mode;
    if (!isStyleOutputAspectRatioMode(mode)) {
      return NextResponse.json(
        {
          error:
            "output_aspect_ratio_mode must be 'source' or one of 9:16,4:5,3:4,2:3,1:1,3:2,4:3,5:4,16:9",
        },
        { status: 400 },
      );
    }
    payload.outputAspectRatioMode = mode;
  }
  if (body.user_guidance_ja !== undefined) {
    if (body.user_guidance_ja !== null && typeof body.user_guidance_ja !== "string") {
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
    payload.userGuidanceJa = trimmed.length > 0 ? trimmed : null;
  }
  if (body.user_guidance_en !== undefined) {
    if (body.user_guidance_en !== null && typeof body.user_guidance_en !== "string") {
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
    payload.userGuidanceEn = trimmed.length > 0 ? trimmed : null;
  }
  if (body.show_source_image_type_control !== undefined) {
    if (typeof body.show_source_image_type_control !== "boolean") {
      return NextResponse.json(
        { error: "show_source_image_type_control must be boolean" },
        { status: 400 },
      );
    }
    payload.showSourceImageTypeControl = body.show_source_image_type_control;
  }
  if (body.show_background_change_control !== undefined) {
    if (typeof body.show_background_change_control !== "boolean") {
      return NextResponse.json(
        { error: "show_background_change_control must be boolean" },
        { status: 400 },
      );
    }
    payload.showBackgroundChangeControl = body.show_background_change_control;
  }
  if (body.show_generation_model_control !== undefined) {
    if (typeof body.show_generation_model_control !== "boolean") {
      return NextResponse.json(
        { error: "show_generation_model_control must be boolean" },
        { status: 400 },
      );
    }
    payload.showGenerationModelControl = body.show_generation_model_control;
  }
  if (body.show_user_prompt_input !== undefined) {
    if (typeof body.show_user_prompt_input !== "boolean") {
      return NextResponse.json(
        { error: "show_user_prompt_input must be boolean" },
        { status: 400 },
      );
    }
    payload.showUserPromptInput = body.show_user_prompt_input;
  }
  if (body.user_prompt_label !== undefined) {
    if (body.user_prompt_label !== null && typeof body.user_prompt_label !== "string") {
      return NextResponse.json(
        { error: "user_prompt_label must be string or null" },
        { status: 400 },
      );
    }
    const trimmed =
      typeof body.user_prompt_label === "string"
        ? body.user_prompt_label.trim()
        : "";
    if (trimmed.length > MAX_USER_PROMPT_LABEL_LENGTH) {
      return NextResponse.json(
        { error: `user_prompt_label must be <= ${MAX_USER_PROMPT_LABEL_LENGTH} chars` },
        { status: 400 },
      );
    }
    payload.userPromptLabel = trimmed.length > 0 ? trimmed : null;
  }
  if (body.user_prompt_placeholder !== undefined) {
    if (
      body.user_prompt_placeholder !== null &&
      typeof body.user_prompt_placeholder !== "string"
    ) {
      return NextResponse.json(
        { error: "user_prompt_placeholder must be string or null" },
        { status: 400 },
      );
    }
    const trimmed =
      typeof body.user_prompt_placeholder === "string"
        ? body.user_prompt_placeholder.trim()
        : "";
    if (trimmed.length > MAX_USER_PROMPT_PLACEHOLDER_LENGTH) {
      return NextResponse.json(
        {
          error: `user_prompt_placeholder must be <= ${MAX_USER_PROMPT_PLACEHOLDER_LENGTH} chars`,
        },
        { status: 400 },
      );
    }
    payload.userPromptPlaceholder = trimmed.length > 0 ? trimmed : null;
  }
  if (body.user_prompt_max_length !== undefined) {
    const v = body.user_prompt_max_length;
    if (v === null) {
      payload.userPromptMaxLength = null;
    } else if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v < 1 ||
      v > GENERATION_PROMPT_MAX_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `user_prompt_max_length must be an integer between 1 and ${GENERATION_PROMPT_MAX_LENGTH}, or null`,
        },
        { status: 400 },
      );
    } else {
      payload.userPromptMaxLength = v;
    }
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
    payload.visibility = body.visibility as "public" | "admin_only";
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
    payload.displayOrder = Math.floor(body.display_order);
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json(
        { error: "is_active must be boolean" },
        { status: 400 },
      );
    }
    payload.isActive = body.is_active;
  }

  // コレクション設定(新規は既存値なし=すべて off/null から判定)
  const collectionResult = parseCollectionSettings(body, {
    isCollectionSeries: false,
    completionThreshold: null,
    mountTemplatePath: null,
    mountLayout: null,
  });
  if (!collectionResult.ok) {
    return NextResponse.json({ error: collectionResult.error }, { status: 400 });
  }
  Object.assign(payload, collectionResult.payload);

  try {
    const created = await createPresetCategory({
      ...payload,
      createdBy: user.id,
    });

    revalidatePresetCategoriesCache();
    await logAdminAction({
      adminUserId: user.id,
      actionType: "preset_category_create",
      targetType: "preset_category",
      targetId: created.id,
      metadata: {
        key: created.key,
        display_name_ja: created.displayNameJa,
        display_name_en: created.displayNameEn,
        skip_base_prefix: created.skipBasePrefix,
        default_image_input_mode: created.defaultImageInputMode,
        output_aspect_ratio_mode: created.outputAspectRatioMode,
        has_user_guidance:
          created.userGuidanceJa !== null || created.userGuidanceEn !== null,
        show_source_image_type_control: created.showSourceImageTypeControl,
        show_background_change_control: created.showBackgroundChangeControl,
        show_generation_model_control: created.showGenerationModelControl,
        show_user_prompt_input: created.showUserPromptInput,
        visibility: created.visibility,
        is_active: created.isActive,
      },
    });
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("duplicate key value violates unique constraint")) {
      return NextResponse.json(
        { error: `key already exists: ${payload.key}` },
        { status: 409 },
      );
    }
    console.error("[admin preset-categories POST] failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
