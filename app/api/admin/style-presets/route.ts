import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  IMAGE_INPUT_MODE_VALUES,
  stylePresetStatusSchema,
  type ImageInputMode,
} from "@/features/style-presets/lib/schema";
import {
  createStylePreset,
  listStylePresetsForAdmin,
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
    const presets = await listStylePresetsForAdmin();
    return NextResponse.json(presets);
  } catch (error) {
    console.error("[Admin Style Presets] GET error:", error);
    return NextResponse.json(
      { error: "スタイル一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let uploadedThumbnailPath: string | null = null;
  let uploadedReferencePath: string | null = null;

  try {
    const user = await requireAdmin();
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

    const backgroundPrompt =
      typeof backgroundPromptEntry === "string" ? backgroundPromptEntry : null;

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "サムネイル画像は必須です" },
        { status: 400 }
      );
    }

    const fileError = validateStylePresetImageFile(file);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }

    const status = stylePresetStatusSchema.safeParse(statusEntry);
    if (!status.success) {
      return NextResponse.json(
        { error: "公開状態が不正です" },
        { status: 400 }
      );
    }

    // category 必須。inactive は新規割当不可 (REQ-7)。
    if (typeof categoryIdEntry !== "string" || categoryIdEntry.length === 0) {
      return NextResponse.json(
        { error: "カテゴリは必須です" },
        { status: 400 }
      );
    }
    const category = await getPresetCategoryById(categoryIdEntry);
    if (!category) {
      return NextResponse.json(
        { error: "指定されたカテゴリが見つかりません" },
        { status: 400 }
      );
    }
    if (!category.isActive) {
      return NextResponse.json(
        { error: "inactive なカテゴリは新規 preset に割り当てられません" },
        { status: 400 }
      );
    }

    // image_input_mode (未指定なら category.default に従う)
    let imageInputMode: ImageInputMode = category.defaultImageInputMode;
    if (typeof imageInputModeEntry === "string" && imageInputModeEntry.length > 0) {
      if (!IMAGE_INPUT_MODE_VALUES.includes(imageInputModeEntry as ImageInputMode)) {
        return NextResponse.json(
          { error: "image_input_mode は 'single' か 'dual' を指定してください" },
          { status: 400 }
        );
      }
      imageInputMode = imageInputModeEntry as ImageInputMode;
    }

    // dual モードなら reference 画像必須
    if (imageInputMode === "dual") {
      if (!(referenceFile instanceof File) || referenceFile.size === 0) {
        return NextResponse.json(
          { error: "dual モードでは参考画像 (image_1) が必須です" },
          { status: 400 }
        );
      }
      const refError = validateStylePresetImageFile(referenceFile);
      if (refError) {
        return NextResponse.json({ error: refError }, { status: 400 });
      }
    }

    const presetId = crypto.randomUUID();
    const uploaded = await uploadStylePresetImage(
      file,
      presetId,
      crypto.randomUUID()
    );
    uploadedThumbnailPath = uploaded.storagePath;

    let referenceImageUrl: string | null = null;
    let referenceImageStoragePath: string | null = null;
    let referenceImageWidth: number | null = null;
    let referenceImageHeight: number | null = null;
    if (imageInputMode === "dual" && referenceFile instanceof File) {
      const refUploaded = await uploadStylePresetReferenceImage(
        referenceFile,
        presetId
      );
      uploadedReferencePath = refUploaded.storagePath;
      referenceImageUrl = refUploaded.imageUrl;
      referenceImageStoragePath = refUploaded.storagePath;
      referenceImageWidth = refUploaded.width;
      referenceImageHeight = refUploaded.height;
    }

    const created = await createStylePreset({
      id: presetId,
      title,
      stylingPrompt: stylingPromptEntry,
      backgroundPrompt,
      thumbnailImageUrl: uploaded.imageUrl,
      thumbnailStoragePath: uploaded.storagePath,
      thumbnailWidth: uploaded.width,
      thumbnailHeight: uploaded.height,
      sortOrder: parseStylePresetSortOrder(sortOrderEntry, 0),
      status: status.data,
      createdBy: user.id,
      categoryId: category.id,
      imageInputMode,
      referenceImageUrl,
      referenceImageStoragePath,
      referenceImageWidth,
      referenceImageHeight,
    });

    revalidateStylePresets();
    return NextResponse.json(created);
  } catch (error) {
    console.error("[Admin Style Presets] POST error:", error);

    if (uploadedThumbnailPath) {
      try {
        await deleteStylePresetImage(uploadedThumbnailPath);
      } catch {
        // rollback best effort
      }
    }
    if (uploadedReferencePath) {
      try {
        await deleteStylePresetImage(uploadedReferencePath);
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
          error instanceof Error ? error.message : "スタイルの作成に失敗しました",
      },
      { status: 500 }
    );
  }
}
