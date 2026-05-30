import { connection, NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createPresetCategory,
  listPresetCategories,
  PRESET_CATEGORY_IMAGE_INPUT_MODES,
} from "@/features/style-presets/lib/preset-category-repository";

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_DISPLAY_NAME_LENGTH = 60;

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
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * POST /api/admin/preset-categories
 * 新規 category を作成する。key は不変 (作成時にだけ決められる)。
 */
export async function POST(request: NextRequest) {
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
