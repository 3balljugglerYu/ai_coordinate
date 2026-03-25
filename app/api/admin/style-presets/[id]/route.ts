import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { stylePresetStatusSchema } from "@/features/style-presets/lib/schema";
import {
  deleteStylePreset,
  getStylePresetForAdminById,
  updateStylePreset,
} from "@/features/style-presets/lib/style-preset-repository";
import { parseStylePresetSortOrder } from "@/features/style-presets/lib/parse-style-preset-sort-order";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
} from "@/features/style-presets/lib/style-preset-storage";
import { validateStylePresetImageFile } from "@/features/style-presets/lib/validate-style-preset-image-file";
import { revalidateStylePresets } from "@/features/style-presets/lib/revalidate-style-presets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let newStoragePath: string | null = null;
  let oldStoragePath: string | null = null;

  try {
    const user = await requireAdmin();
    const { id } = await params;
    const existing = await getStylePresetForAdminById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "スタイルが見つかりません" },
        { status: 404 }
      );
    }

    oldStoragePath = existing.thumbnailStoragePath;

    const formData = await request.formData();
    const title = formData.get("title");
    const stylingPromptEntry = formData.get("styling_prompt");
    const backgroundPromptEntry = formData.get("background_prompt");
    const sortOrderEntry = formData.get("sort_order");
    const statusEntry = formData.get("status");
    const file = formData.get("file");

    if (typeof title !== "string" || title.trim() === "") {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    if (
      typeof stylingPromptEntry !== "string" ||
      stylingPromptEntry.trim() === ""
    ) {
      return NextResponse.json(
        { error: "styling prompt は必須です" },
        { status: 400 }
      );
    }

    const status = stylePresetStatusSchema.safeParse(statusEntry);
    if (!status.success) {
      return NextResponse.json(
        { error: "公開状態が不正です" },
        { status: 400 }
      );
    }

    const updatePayload = {
      title,
      stylingPrompt: stylingPromptEntry,
      backgroundPrompt:
        typeof backgroundPromptEntry === "string"
          ? backgroundPromptEntry
          : existing.backgroundPrompt,
      sortOrder: parseStylePresetSortOrder(sortOrderEntry, existing.sortOrder),
      status: status.data,
      updatedBy: user.id,
    };

    if (file instanceof File && file.size > 0) {
      const fileError = validateStylePresetImageFile(file);
      if (fileError) {
        return NextResponse.json({ error: fileError }, { status: 400 });
      }

      const uploaded = await uploadStylePresetImage(file, id, crypto.randomUUID());
      newStoragePath = uploaded.storagePath;

      const updated = await updateStylePreset(
        id,
        {
          ...updatePayload,
          thumbnailImageUrl: uploaded.imageUrl,
          thumbnailStoragePath: uploaded.storagePath,
          thumbnailWidth: uploaded.width,
          thumbnailHeight: uploaded.height,
        }
      );

      if (oldStoragePath && oldStoragePath !== newStoragePath) {
        try {
          await deleteStylePresetImage(oldStoragePath);
        } catch {
          // best effort
        }
      }

      revalidateStylePresets();
      return NextResponse.json(updated);
    }

    const updated = await updateStylePreset(id, updatePayload);
    revalidateStylePresets();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Admin Style Presets] PATCH error:", error);

    if (newStoragePath) {
      try {
        await deleteStylePresetImage(newStoragePath);
      } catch {
        // rollback best effort
      }
    }

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "スタイルの更新に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const existing = await getStylePresetForAdminById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "スタイルが見つかりません" },
        { status: 404 }
      );
    }

    await deleteStylePreset(id);

    if (existing.thumbnailStoragePath) {
      try {
        await deleteStylePresetImage(existing.thumbnailStoragePath);
      } catch (error) {
        console.error(
          "[Admin Style Presets] DELETE storage cleanup error:",
          error
        );
      }
    }

    revalidateStylePresets();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Style Presets] DELETE error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "スタイルの削除に失敗しました",
      },
      { status: 500 }
    );
  }
}
