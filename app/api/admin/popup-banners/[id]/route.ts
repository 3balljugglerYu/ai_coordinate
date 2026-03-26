import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  deletePopupBanner,
  getPopupBannerById,
  updatePopupBanner,
} from "@/features/popup-banners/lib/popup-banner-repository";
import {
  POPUP_BANNER_ALLOWED_MIME_TYPES,
  POPUP_BANNER_MAX_FILE_SIZE,
  popupBannerStatusSchema,
  type PopupBannerUpdate,
} from "@/features/popup-banners/lib/schema";
import {
  deletePopupBannerImage,
  uploadPopupBannerImage,
} from "@/features/popup-banners/lib/popup-banner-storage";
import { isValidLinkUrl } from "@/features/popup-banners/lib/validation";

function parseCheckboxValue(entry: FormDataEntryValue | null): boolean {
  return entry === "true" || entry === "on" || entry === "1";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;

  try {
    const existing = await getPopupBannerById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "ポップアップバナーが見つかりません" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const updateData: PopupBannerUpdate = {};

    const linkUrlEntry = formData.get("link_url");
    const altEntry = formData.get("alt");
    const statusEntry = formData.get("status");
    const displayStartAtEntry = formData.get("display_start_at");
    const displayEndAtEntry = formData.get("display_end_at");
    const displayOrderEntry = formData.get("display_order");
    const showOnceOnlyEntry = formData.get("show_once_only");
    const file = formData.get("file");

    if (linkUrlEntry !== null) {
      const trimmedLink =
        typeof linkUrlEntry === "string" ? linkUrlEntry.trim() : "";
      if (trimmedLink && !isValidLinkUrl(trimmedLink)) {
        return NextResponse.json(
          {
            error:
              "遷移先URLは / で始まる内部パスか、https:// で始まるURLのみ使用できます",
          },
          { status: 400 }
        );
      }
      updateData.link_url = trimmedLink || null;
    }

    if (altEntry !== null) {
      if (typeof altEntry !== "string" || altEntry.trim() === "") {
        return NextResponse.json(
          { error: "altテキストは必須です" },
          { status: 400 }
        );
      }
      updateData.alt = altEntry.trim();
    }

    if (statusEntry !== null) {
      const parsedStatus = popupBannerStatusSchema.safeParse(statusEntry);
      if (!parsedStatus.success) {
        return NextResponse.json(
          { error: "ステータスが不正です" },
          { status: 400 }
        );
      }
      updateData.status = parsedStatus.data;
    }

    if (displayStartAtEntry !== null) {
      updateData.display_start_at =
        typeof displayStartAtEntry === "string" && displayStartAtEntry.trim()
          ? displayStartAtEntry.trim()
          : null;
    }

    if (displayEndAtEntry !== null) {
      updateData.display_end_at =
        typeof displayEndAtEntry === "string" && displayEndAtEntry.trim()
          ? displayEndAtEntry.trim()
          : null;
    }

    if (displayOrderEntry !== null) {
      updateData.display_order =
        typeof displayOrderEntry === "string"
          ? parseInt(displayOrderEntry, 10) || 0
          : 0;
    }

    if (showOnceOnlyEntry !== null) {
      updateData.show_once_only = parseCheckboxValue(showOnceOnlyEntry);
    }

    if (file instanceof File && file.size > 0) {
      if (!POPUP_BANNER_ALLOWED_MIME_TYPES.includes(file.type as never)) {
        return NextResponse.json(
          {
            error: `許可されていないファイル形式です。対応: ${POPUP_BANNER_ALLOWED_MIME_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      if (file.size > POPUP_BANNER_MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "ファイルサイズは5MB以下にしてください" },
          { status: 400 }
        );
      }

      const uploaded = await uploadPopupBannerImage(file, id);
      updateData.image_url = uploaded.imageUrl;
      updateData.storage_path = uploaded.storagePath;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "更新する項目がありません" },
        { status: 400 }
      );
    }

    const updated = await updatePopupBanner(id, updateData);

    revalidateTag("popup-banners", "max");
    revalidatePath("/");

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[Admin Popup Banners] PATCH error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ポップアップバナーの更新に失敗しました",
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
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;

  try {
    const existing = await getPopupBannerById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "ポップアップバナーが見つかりません" },
        { status: 404 }
      );
    }

    await deletePopupBannerImage(existing.storage_path);
    await deletePopupBanner(id);

    revalidateTag("popup-banners", "max");
    revalidatePath("/");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Popup Banners] DELETE error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ポップアップバナーの削除に失敗しました",
      },
      { status: 500 }
    );
  }
}
