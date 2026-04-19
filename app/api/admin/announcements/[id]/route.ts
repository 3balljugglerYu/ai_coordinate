import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  deleteAnnouncement,
  getAnnouncementForAdminById,
  updateAnnouncement,
} from "@/features/announcements/lib/announcement-repository";
import { announcementAdminSaveSchema } from "@/features/announcements/lib/schema";
import {
  extractAnnouncementAssetPaths,
  extractAnnouncementBodyText,
  hasMeaningfulAnnouncementContent,
  validateAnnouncementDocument,
} from "@/features/announcements/lib/announcement-rich-text";
import { deleteAnnouncementImages } from "@/features/announcements/lib/announcement-storage";
import { decorateAnnouncementAdmin } from "@/features/announcements/lib/presentation";
import { revalidateAnnouncements } from "@/features/announcements/lib/revalidate-announcements";

function difference(source: string[], target: string[]) {
  return source.filter((value) => !target.includes(value));
}

export async function GET(
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

  try {
    const { id } = await params;
    const announcement = await getAnnouncementForAdminById(id);

    if (!announcement) {
      return NextResponse.json(
        { error: "お知らせが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(decorateAnnouncementAdmin(announcement));
  } catch (error) {
    console.error("[Admin Announcements] GET by id error:", error);
    return NextResponse.json(
      { error: "お知らせの取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let rollbackPaths: string[] = [];
  let cleanupPaths: string[] = [];

  try {
    const user = await requireAdmin();
    const { id } = await params;
    const existing = await getAnnouncementForAdminById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "お知らせが見つかりません" },
        { status: 404 }
      );
    }

    const payload = announcementAdminSaveSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      return NextResponse.json(
        { error: "リクエストが不正です" },
        { status: 400 }
      );
    }

    const validatedDocument = validateAnnouncementDocument(payload.data.bodyJson);
    if (!validatedDocument.ok) {
      return NextResponse.json({ error: validatedDocument.error }, { status: 400 });
    }

    const bodyText = extractAnnouncementBodyText(validatedDocument.bodyJson);
    const assetPaths = extractAnnouncementAssetPaths(validatedDocument.bodyJson);
    if (!hasMeaningfulAnnouncementContent(bodyText, assetPaths)) {
      return NextResponse.json(
        { error: "本文を入力してください" },
        { status: 400 }
      );
    }

    const normalizedPublishAt =
      payload.data.status === "published"
        ? payload.data.publishAt ?? new Date().toISOString()
        : null;

    rollbackPaths = difference(assetPaths, existing.assetPaths);
    cleanupPaths = difference(existing.assetPaths, assetPaths);

    const updated = await updateAnnouncement(id, {
      title: payload.data.title.trim(),
      bodyJson: validatedDocument.bodyJson,
      bodyText,
      assetPaths,
      status: payload.data.status,
      publishAt: normalizedPublishAt,
      updatedBy: user.id,
    });

    if (cleanupPaths.length > 0) {
      try {
        await deleteAnnouncementImages(cleanupPaths);
      } catch {
        // cleanup best effort
      }
    }

    await logAdminAction({
      adminUserId: user.id,
      actionType: "announcement_update",
      targetType: "admin_announcement",
      targetId: updated.id,
      metadata: {
        before: {
          status: existing.status,
          publishAt: existing.publishAt,
        },
        after: {
          status: updated.status,
          publishAt: updated.publishAt,
        },
      },
    });

    revalidateAnnouncements(updated.id);
    return NextResponse.json(decorateAnnouncementAdmin(updated));
  } catch (error) {
    console.error("[Admin Announcements] PATCH error:", error);

    if (rollbackPaths.length > 0) {
      try {
        await deleteAnnouncementImages(rollbackPaths);
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
          error instanceof Error ? error.message : "お知らせの更新に失敗しました",
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
    const user = await requireAdmin();
    const { id } = await params;
    const existing = await getAnnouncementForAdminById(id);

    if (!existing) {
      return NextResponse.json(
        { error: "お知らせが見つかりません" },
        { status: 404 }
      );
    }

    await deleteAnnouncement(id);

    if (existing.assetPaths.length > 0) {
      try {
        await deleteAnnouncementImages(existing.assetPaths);
      } catch (error) {
        console.error("[Admin Announcements] DELETE cleanup error:", error);
      }
    }

    await logAdminAction({
      adminUserId: user.id,
      actionType: "announcement_delete",
      targetType: "admin_announcement",
      targetId: existing.id,
      metadata: {
        status: existing.status,
        publishAt: existing.publishAt,
      },
    });

    revalidateAnnouncements(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Announcements] DELETE error:", error);

    if (error instanceof NextResponse) {
      return error;
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "お知らせの削除に失敗しました",
      },
      { status: 500 }
    );
  }
}
