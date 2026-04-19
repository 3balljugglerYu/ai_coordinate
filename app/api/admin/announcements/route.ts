import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createAnnouncement,
  listAnnouncementsForAdmin,
} from "@/features/announcements/lib/announcement-repository";
import {
  announcementAdminSaveSchema,
  type AnnouncementAdminSaveInput,
} from "@/features/announcements/lib/schema";
import {
  extractAnnouncementAssetPaths,
  extractAnnouncementBodyText,
  hasMeaningfulAnnouncementContent,
  validateAnnouncementDocument,
} from "@/features/announcements/lib/announcement-rich-text";
import { deleteAnnouncementImages } from "@/features/announcements/lib/announcement-storage";
import { decorateAnnouncementAdmin } from "@/features/announcements/lib/presentation";
import { revalidateAnnouncements } from "@/features/announcements/lib/revalidate-announcements";

function normalizeSaveInput(input: AnnouncementAdminSaveInput) {
  const validatedDocument = validateAnnouncementDocument(input.bodyJson);
  if (!validatedDocument.ok) {
    throw new Error(validatedDocument.error);
  }

  const bodyText = extractAnnouncementBodyText(validatedDocument.bodyJson);
  const assetPaths = extractAnnouncementAssetPaths(validatedDocument.bodyJson);
  if (!hasMeaningfulAnnouncementContent(bodyText, assetPaths)) {
    throw new Error("本文を入力してください");
  }

  return {
    title: input.title.trim(),
    status: input.status,
    publishAt:
      input.status === "published"
        ? input.publishAt ?? new Date().toISOString()
        : null,
    bodyJson: validatedDocument.bodyJson,
    bodyText,
    assetPaths,
  };
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  try {
    const announcements = await listAnnouncementsForAdmin();
    return NextResponse.json(
      announcements.map((announcement) => decorateAnnouncementAdmin(announcement))
    );
  } catch (error) {
    console.error("[Admin Announcements] GET error:", error);
    return NextResponse.json(
      { error: "お知らせ一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let uploadedPathsToRollback: string[] = [];

  try {
    const user = await requireAdmin();
    const payload = announcementAdminSaveSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      return NextResponse.json(
        { error: "リクエストが不正です" },
        { status: 400 }
      );
    }

    const normalized = normalizeSaveInput(payload.data);
    uploadedPathsToRollback = normalized.assetPaths;

    const created = await createAnnouncement({
      ...normalized,
      createdBy: user.id,
    });

    await logAdminAction({
      adminUserId: user.id,
      actionType: "announcement_create",
      targetType: "admin_announcement",
      targetId: created.id,
      metadata: {
        status: created.status,
        publishAt: created.publishAt,
      },
    });

    revalidateAnnouncements(created.id);
    return NextResponse.json(decorateAnnouncementAdmin(created));
  } catch (error) {
    console.error("[Admin Announcements] POST error:", error);

    if (uploadedPathsToRollback.length > 0) {
      try {
        await deleteAnnouncementImages(uploadedPathsToRollback);
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
          error instanceof Error ? error.message : "お知らせの作成に失敗しました",
      },
      { status: 500 }
    );
  }
}
