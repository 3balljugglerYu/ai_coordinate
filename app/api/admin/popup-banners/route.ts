import { connection, NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createPopupBanner,
  listPopupBanners,
} from "@/features/popup-banners/lib/popup-banner-repository";
import {
  POPUP_BANNER_ALLOWED_MIME_TYPES,
  POPUP_BANNER_MAX_FILE_SIZE,
  popupBannerStatusSchema,
} from "@/features/popup-banners/lib/schema";
import { uploadPopupBannerImage } from "@/features/popup-banners/lib/popup-banner-storage";
import { isValidLinkUrl } from "@/features/popup-banners/lib/validation";

function parseCheckboxValue(entry: FormDataEntryValue | null): boolean {
  return entry === "true" || entry === "on" || entry === "1";
}

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
    const banners = await listPopupBanners();
    return NextResponse.json(banners);
  } catch (error) {
    console.error("[Admin Popup Banners] GET error:", error);
    return NextResponse.json(
      { error: "ポップアップバナー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let uploadedStoragePath: string | null = null;

  try {
    await requireAdmin();
    const formData = await request.formData();

    const file = formData.get("file");
    const altEntry = formData.get("alt");
    const linkUrlEntry = formData.get("link_url");
    const statusEntry = formData.get("status");
    const displayStartAtEntry = formData.get("display_start_at");
    const displayEndAtEntry = formData.get("display_end_at");
    const displayOrderEntry = formData.get("display_order");
    const showOnceOnlyEntry = formData.get("show_once_only");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "画像ファイルは必須です" },
        { status: 400 }
      );
    }

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

    if (typeof altEntry !== "string" || altEntry.trim() === "") {
      return NextResponse.json(
        { error: "altテキストは必須です" },
        { status: 400 }
      );
    }

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

    const parsedStatus = popupBannerStatusSchema.safeParse(statusEntry);
    if (!parsedStatus.success) {
      return NextResponse.json(
        { error: "ステータスが不正です" },
        { status: 400 }
      );
    }

    const popupBannerId = crypto.randomUUID();
    const uploaded = await uploadPopupBannerImage(file, popupBannerId);
    uploadedStoragePath = uploaded.storagePath;

    const created = await createPopupBanner({
      id: popupBannerId,
      image_url: uploaded.imageUrl,
      storage_path: uploaded.storagePath,
      link_url: trimmedLink || null,
      alt: altEntry.trim(),
      show_once_only: parseCheckboxValue(showOnceOnlyEntry),
      display_start_at:
        typeof displayStartAtEntry === "string" && displayStartAtEntry.trim()
          ? displayStartAtEntry.trim()
          : null,
      display_end_at:
        typeof displayEndAtEntry === "string" && displayEndAtEntry.trim()
          ? displayEndAtEntry.trim()
          : null,
      display_order:
        typeof displayOrderEntry === "string"
          ? parseInt(displayOrderEntry, 10) || 0
          : 0,
      status: parsedStatus.data,
    });

    revalidateTag("popup-banners", "max");
    revalidatePath("/");

    return NextResponse.json(created);
  } catch (error) {
    console.error("[Admin Popup Banners] POST error:", error);

    if (uploadedStoragePath) {
      try {
        const { deletePopupBannerImage } = await import(
          "@/features/popup-banners/lib/popup-banner-storage"
        );
        await deletePopupBannerImage(uploadedStoragePath);
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
          error instanceof Error
            ? error.message
            : "ポップアップバナーの作成に失敗しました",
      },
      { status: 500 }
    );
  }
}
