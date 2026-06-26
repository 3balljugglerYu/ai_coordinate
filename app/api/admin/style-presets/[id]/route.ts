import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import {
  DUAL_REFERENCE_SOURCE_VALUES,
  IMAGE_INPUT_MODE_VALUES,
  stylePresetStatusSchema,
  type DualReferenceSource,
  type ImageInputMode,
} from "@/features/style-presets/lib/schema";
import {
  deleteStylePreset,
  getStylePresetForAdminById,
  listAllowlistedCreators,
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
  let oldReferencePath: string | null = null;

  // CSRF 防御: cookie 認証 mutation route は Same-Origin Origin 検証 (REQ-14)
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

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
    oldReferencePath = existing.referenceImageStoragePath;

    const formData = await request.formData();
    const title = formData.get("title");
    const stylingPromptEntry = formData.get("styling_prompt");
    const backgroundPromptEntry = formData.get("background_prompt");
    const sortOrderEntry = formData.get("sort_order");
    const statusEntry = formData.get("status");
    const categoryIdEntry = formData.get("category_id");
    const imageInputModeEntry = formData.get("image_input_mode");
    const dualReferenceSourceEntry = formData.get("dual_reference_source");
    const providerUserIdEntry = formData.get("provider_user_id");
    const file = formData.get("file");
    const referenceFile = formData.get("reference_file");
    const hasNewReferenceFile =
      referenceFile instanceof File && referenceFile.size > 0;

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

    // dual_reference_source 解決: 未指定なら現在値維持。single の場合は 'admin' に矯正 (DB CHECK 制約)
    let dualReferenceSource: DualReferenceSource = existing.dualReferenceSource;
    if (
      typeof dualReferenceSourceEntry === "string" &&
      dualReferenceSourceEntry.length > 0
    ) {
      if (
        !DUAL_REFERENCE_SOURCE_VALUES.includes(
          dualReferenceSourceEntry as DualReferenceSource,
        )
      ) {
        return NextResponse.json(
          { error: "dual_reference_source は 'admin' か 'user_upload' を指定してください" },
          { status: 400 }
        );
      }
      dualReferenceSource = dualReferenceSourceEntry as DualReferenceSource;
    }
    if (imageInputMode === "single") {
      dualReferenceSource = "admin";
    }

    // dual + admin のときのみ reference 画像必須 (新規 file または既存 storage_path)
    const willHaveReference =
      hasNewReferenceFile
        ? true
        : existing.referenceImageStoragePath !== null;
    if (
      imageInputMode === "dual" &&
      dualReferenceSource === "admin" &&
      !willHaveReference
    ) {
      return NextResponse.json(
        { error: "dual (admin) モードでは参考画像 (image_1) が必須です" },
        { status: 400 }
      );
    }
    if (hasNewReferenceFile) {
      const refError = validateStylePresetImageFile(referenceFile);
      if (refError) {
        return NextResponse.json({ error: refError }, { status: 400 });
      }
    }

    // クリエイター(提供者クレジット)の解決:
    //   - フィールド未送信 → 現状維持(undefined)
    //   - 空文字 → null(クレジット解除)
    //   - 既存と同値 → そのまま維持(allowlist 外の既存クレジットも壊さない)
    //   - 新規/変更 → allowlist 所属を必須に
    let providerUserId: string | null | undefined;
    if (typeof providerUserIdEntry !== "string") {
      providerUserId = undefined;
    } else if (providerUserIdEntry.length === 0) {
      providerUserId = null;
    } else if (
      existing.providerUserId !== null &&
      providerUserIdEntry === existing.providerUserId
    ) {
      // 既存と同値(変更なし)= グランドファーザー。allowlist 外の既存クレジットも壊さない。
      providerUserId = providerUserIdEntry;
    } else {
      const creators = await listAllowlistedCreators();
      if (!creators.some((c) => c.id === providerUserIdEntry)) {
        return NextResponse.json(
          { error: "クリエイターは招待リストから選んでください" },
          { status: 400 }
        );
      }
      providerUserId = providerUserIdEntry;
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
      dualReferenceSource,
      // reference image 系はこの後で上書きするか既存維持
      referenceImageUrl: existing.referenceImageUrl,
      referenceImageStoragePath: existing.referenceImageStoragePath,
      referenceImageWidth: existing.referenceImageWidth,
      referenceImageHeight: existing.referenceImageHeight,
      // provider は undefined(未送信)なら repository 側で現状維持。
      providerUserId,
    };

    // 新しい reference file (= admin dual の場合のみ意味あり) を新規 object に保存し、DB 更新成功後に旧 object を削除する。
    // 既存 fixed path を直接 upsert すると、DB 更新失敗時に旧 reference を壊すため。
    if (
      imageInputMode === "dual" &&
      dualReferenceSource === "admin" &&
      hasNewReferenceFile
    ) {
      const uploaded = await uploadStylePresetReferenceImage(
        referenceFile,
        id,
        `reference-${crypto.randomUUID()}`
      );
      newReferencePath = uploaded.storagePath;
      updatePayload.referenceImageUrl = uploaded.imageUrl;
      updatePayload.referenceImageStoragePath = uploaded.storagePath;
      updatePayload.referenceImageWidth = uploaded.width;
      updatePayload.referenceImageHeight = uploaded.height;
    }

    // 以下のケースで reference 情報をクリア (= DB のみ。旧 object は後段で削除):
    //   1. single モードに切り替えた (= reference 不要)
    //   2. dual だが dual_reference_source が user_upload に切り替わった (= preset の固定参考画像は使わない)
    if (
      imageInputMode === "single" ||
      (imageInputMode === "dual" && dualReferenceSource === "user_upload")
    ) {
      updatePayload.referenceImageUrl = null;
      updatePayload.referenceImageStoragePath = null;
      updatePayload.referenceImageWidth = null;
      updatePayload.referenceImageHeight = null;
    }

    const deleteOldReferenceAfterUpdate = async () => {
      if (!oldReferencePath) {
        return;
      }
      const switchedAwayFromAdminDual =
        imageInputMode === "single" ||
        (imageInputMode === "dual" && dualReferenceSource === "user_upload");
      const shouldDeleteOldReference =
        switchedAwayFromAdminDual ||
        (newReferencePath !== null && oldReferencePath !== newReferencePath);
      if (!shouldDeleteOldReference) {
        return;
      }

      try {
        await deleteStylePresetImage(oldReferencePath);
      } catch {
        // best effort
      }
    };

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
      await deleteOldReferenceAfterUpdate();

      revalidateStylePresets();
      return NextResponse.json(updated);
    }

    const updated = await updateStylePreset(id, updatePayload);
    await deleteOldReferenceAfterUpdate();
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
    if (newReferencePath && newReferencePath !== oldReferencePath) {
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // CSRF 防御: cookie 認証 mutation route は Same-Origin Origin 検証 (REQ-14)
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

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
