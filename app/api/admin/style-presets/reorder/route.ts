import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { stylePresetReorderSchema } from "@/features/style-presets/lib/schema";
import {
  listStylePresetsForAdmin,
  reorderStylePresets,
} from "@/features/style-presets/lib/style-preset-repository";
import { revalidateStylePresets } from "@/features/style-presets/lib/revalidate-style-presets";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const payload = await request.json().catch(() => null);
    const parsed = stylePresetReorderSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "order は UUID 配列で指定してください" },
        { status: 400 }
      );
    }

    const currentPresets = await listStylePresetsForAdmin();
    const currentIds = currentPresets.map((preset) => preset.id);
    const requestedIds = parsed.data.order;
    const requestedIdSet = new Set(requestedIds);

    const isCompleteReorder =
      requestedIds.length === currentIds.length &&
      requestedIdSet.size === requestedIds.length &&
      currentIds.every((id) => requestedIdSet.has(id));

    if (!isCompleteReorder) {
      return NextResponse.json(
        { error: "order は現在の全スタイルIDを重複なく含めてください" },
        { status: 400 }
      );
    }

    await reorderStylePresets(parsed.data.order, user.id);
    revalidateStylePresets();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Style Presets] reorder error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "表示順の更新に失敗しました",
      },
      { status: 500 }
    );
  }
}
