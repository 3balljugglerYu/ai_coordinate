import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { uploadAnnouncementImage } from "@/features/announcements/lib/announcement-storage";
import {
  ANNOUNCEMENT_ALLOWED_MIME_TYPES,
  ANNOUNCEMENT_MAX_FILE_SIZE,
} from "@/features/announcements/lib/schema";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "画像ファイルは必須です" },
        { status: 400 }
      );
    }

    if (!ANNOUNCEMENT_ALLOWED_MIME_TYPES.includes(file.type as never)) {
      return NextResponse.json(
        {
          error: `許可されていないファイル形式です。対応: ${ANNOUNCEMENT_ALLOWED_MIME_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (file.size > ANNOUNCEMENT_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "ファイルサイズは5MB以下にしてください" },
        { status: 400 }
      );
    }

    const uploaded = await uploadAnnouncementImage(file);
    return NextResponse.json(uploaded);
  } catch (error) {
    console.error("[Admin Announcements Images] POST error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "画像アップロードに失敗しました",
      },
      { status: 500 }
    );
  }
}
