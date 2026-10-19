import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
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
import {
  attachAnnouncementPushSummaries,
  syncAnnouncementPush,
} from "@/features/push-broadcasts/lib/announcement-push-service";
import { getPushBroadcastForAnnouncement } from "@/features/push-broadcasts/lib/push-broadcast-repository";

function difference(source: string[], target: string[]) {
  return source.filter((value) => !target.includes(value));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const announcement = await getAnnouncementForAdminById(id);

    if (!announcement) {
      return NextResponse.json(
        { error: "お知らせが見つかりません" },
        { status: 404 }
      );
    }

    const [view] = await attachAnnouncementPushSummaries([
      decorateAnnouncementAdmin(announcement),
    ]);
    return NextResponse.json(view);
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
  // プッシュの配信も作る・取り消す入口なので、別サイトからの送信を断る
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

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

    // 公開日時の変更・下書きへの戻し・「送る」を外した場合も、送る前なら合わせる
    const pushResult = await syncAnnouncementPush({
      announcement: updated,
      sendPush: payload.data.sendPush,
      adminUserId: user.id,
    });

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
        push: pushResult.action,
        ...(pushResult.error ? { pushError: pushResult.error } : {}),
      },
    });

    revalidateAnnouncements(updated.id);
    return NextResponse.json({
      ...decorateAnnouncementAdmin(updated),
      push: pushResult.push,
      ...(pushResult.error ? { pushError: pushResult.error } : {}),
    });
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // プッシュの配信も作る・取り消す入口なので、別サイトからの送信を断る
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

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

    // お知らせを消すと、紐づく配信の行も CASCADE で消える（送信待ちも送らない）。
    // 配信の記録はここで操作ログに写しておく（送った・取り消した等の履歴が残るように）
    let pushRecord: Record<string, unknown> | null = null;
    try {
      const push = await getPushBroadcastForAnnouncement(id);
      pushRecord = push
        ? {
            id: push.id,
            status: push.status,
            title: push.title,
            body: push.body,
            sendAt: push.sendAt,
            startedAt: push.startedAt,
            finishedAt: push.finishedAt,
            canceledAt: push.canceledAt,
            enqueuedCount: push.enqueuedCount,
          }
        : null;
    } catch (error) {
      console.error("[Admin Announcements] DELETE push record error:", error);
      pushRecord = { error: "プッシュ通知の記録を読めませんでした" };
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
        title: existing.title,
        status: existing.status,
        publishAt: existing.publishAt,
        ...(pushRecord ? { push: pushRecord } : {}),
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
