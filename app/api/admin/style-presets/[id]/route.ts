import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  IMAGE_INPUT_MODE_VALUES,
  stylePresetStatusSchema,
  type ImageInputMode,
} from "@/features/style-presets/lib/schema";
import {
  deleteStylePreset,
  getStylePresetForAdminById,
  updateStylePreset,
} from "@/features/style-presets/lib/style-preset-repository";
import { getPresetCategoryById } from "@/features/style-presets/lib/preset-category-repository";
import { parseStylePresetSortOrder } from "@/features/style-presets/lib/parse-style-preset-sort-order";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
  uploadStylePresetReferenceImage,
} from "@/features/style-presets/lib/style-preset-storage";
import { validateStylePresetImageFile } from "@/features/style-presets/lib/validate-style-preset-image-file";
import { revalidateStylePresets } from "@/features/style-presets/lib/revalidate-style-presets";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let newThumbnailPath: string | null = null;
  let newReferencePath: string | null = null;
  let oldThumbnailPath: string | null = null;

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

    oldThumbnailPath = existing.thumbnailStoragePath;

    const formData = await request.formData();
    const title = formData.get("title");
    const stylingPromptEntry = formData.get("styling_prompt");
    const backgroundPromptEntry = formData.get("background_prompt");
    const sortOrderEntry = formData.get("sort_order");
    const statusEntry = formData.get("status");
    const categoryIdEntry = formData.get("category_id");
    const imageInputModeEntry = formData.get("image_input_mode");
    const file = formData.get("file");
    const referenceFile = formData.get("reference_file");

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

    // category 解決: 未指定なら現在値を維持。指定された場合は inactive チェック (現在値と同じなら維持可、別 inactive への変更は不可)
    let targetCategoryId = existing.category.id;
    if (typeof categoryIdEntry === "string" && categoryIdEntry.length > 0) {
      targetCategoryId = categoryIdEntry;
      if (targetCategoryId !== existing.category.id) {
        const targetCategory = await getPresetCategoryById(targetCategoryId);
        if (!targetCategory) {
          return NextResponse.json(
            { error: "指定されたカテゴリが見つかりません" },
            { status: 400 }
          );
        }
        if (!targetCategory.isActive) {
          return NextResponse.json(
            {
              error:
                "inactive なカテゴリへ変更することはできません (新規 preset 作成と同様)",
            },
            { status: 400 }
          );
        }
      }
    }

    // image_input_mode 解決: 未指定なら現在値維持
    let imageInputMode: ImageInputMode = existing.imageInputMode;
    if (typeof imageInputModeEntry === "string" && imageInputModeEntry.length > 0) {
      if (!IMAGE_INPUT_MODE_VALUES.includes(imageInputModeEntry as ImageInputMode)) {
        return NextResponse.json(
          { error: "image_input_mode は 'single' か 'dual' を指定してください" },
          { status: 400 }
        );
      }
      imageInputMode = imageInputModeEntry as ImageInputMode;
    }

    // dual モードの整合性: 新しい mode が dual の場合、reference 画像が必要 (新規 file または既存 storage_path)
    const willHaveReference =
      referenceFile instanceof File && referenceFile.size > 0
        ? true
        : existing.referenceImageStoragePath !== null;
    if (imageInputMode === "dual" && !willHaveReference) {
      return NextResponse.json(
        { error: "dual モードでは参考画像 (image_1) が必須です" },
        { status: 400 }
      );
    }
    if (referenceFile instanceof File && referenceFile.size > 0) {
      const refError = validateStylePresetImageFile(referenceFile);
      if (refError) {
        return NextResponse.json({ error: refError }, { status: 400 });
      }
    }

    // 共通の更新ペイロード
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
      categoryId: targetCategoryId,
      imageInputMode,
      // reference image 系はこの後で上書きするか既存維持
      referenceImageUrl: existing.referenceImageUrl,
      referenceImageStoragePath: existing.referenceImageStoragePath,
      referenceImageWidth: existing.referenceImageWidth,
      referenceImageHeight: existing.referenceImageHeight,
    };

    // 新しい reference file がきたら upsert (storage path は固定 `{presetId}/reference.webp`)
    if (referenceFile instanceof File && referenceFile.size > 0) {
      const uploaded = await uploadStylePresetReferenceImage(referenceFile, id);
      newReferencePath = uploaded.storagePath;
      updatePayload.referenceImageUrl = uploaded.imageUrl;
      updatePayload.referenceImageStoragePath = uploaded.storagePath;
      updatePayload.referenceImageWidth = uploaded.width;
      updatePayload.referenceImageHeight = uploaded.height;
    }

    // single モードに切り替えた場合は reference 情報をクリア (= 物理ファイルは bucket に残るが DB はクリア)
    if (
      imageInputMode === "single" &&
      existing.imageInputMode === "dual"
    ) {
      updatePayload.referenceImageUrl = null;
      updatePayload.referenceImageStoragePath = null;
      updatePayload.referenceImageWidth = null;
      updatePayload.referenceImageHeight = null;
    }

    // thumbnail file が来た場合は差し替え
    if (file instanceof File && file.size > 0) {
      const fileError = validateStylePresetImageFile(file);
      if (fileError) {
        return NextResponse.json({ error: fileError }, { status: 400 });
      }

      const uploaded = await uploadStylePresetImage(
        file,
        id,
        crypto.randomUUID()
      );
      newThumbnailPath = uploaded.storagePath;

      const updated = await updateStylePreset(id, {
        ...updatePayload,
        thumbnailImageUrl: uploaded.imageUrl,
        thumbnailStoragePath: uploaded.storagePath,
        thumbnailWidth: uploaded.width,
        thumbnailHeight: uploaded.height,
      });

      if (oldThumbnailPath && oldThumbnailPath !== newThumbnailPath) {
        try {
          await deleteStylePresetImage(oldThumbnailPath);
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

    if (newThumbnailPath) {
      try {
        await deleteStylePresetImage(newThumbnailPath);
      } catch {
        // rollback best effort
      }
    }
    if (newReferencePath) {
      try {
        await deleteStylePresetImage(newReferencePath);
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
    if (existing.referenceImageStoragePath) {
      try {
        await deleteStylePresetImage(existing.referenceImageStoragePath);
      } catch (error) {
        console.error(
          "[Admin Style Presets] DELETE reference cleanup error:",
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
