import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { stylePresetStatusSchema } from "@/features/style-presets/lib/schema";
import {
  createStylePreset,
  listStylePresetsForAdmin,
} from "@/features/style-presets/lib/style-preset-repository";
import { parseStylePresetSortOrder } from "@/features/style-presets/lib/parse-style-preset-sort-order";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
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
  let uploadedStoragePath: string | null = null;

  try {
    const user = await requireAdmin();
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

    const presetId = crypto.randomUUID();
    const uploaded = await uploadStylePresetImage(
      file,
      presetId,
      crypto.randomUUID()
    );
    uploadedStoragePath = uploaded.storagePath;

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
    });

    revalidateStylePresets();
    return NextResponse.json(created);
  } catch (error) {
    console.error("[Admin Style Presets] POST error:", error);

    if (uploadedStoragePath) {
      try {
        await deleteStylePresetImage(uploadedStoragePath);
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
