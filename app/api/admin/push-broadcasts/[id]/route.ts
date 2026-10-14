import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { logAdminAction } from "@/lib/admin-audit";
import {
  cancelScheduledPushBroadcast,
  getPushBroadcastById,
} from "@/features/push-broadcasts/lib/push-broadcast-repository";
import { decoratePushBroadcastAdmin } from "@/features/push-broadcasts/lib/presentation";

/** 今できる変更は「予約の取り消し」だけ（送信が始まったものは戻せない） */
const pushBroadcastPatchSchema = z.object({
  status: z.literal("canceled"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin();
    const { id } = await params;

    const payload = pushBroadcastPatchSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!payload.success) {
      return NextResponse.json(
        { error: "リクエストが不正です" },
        { status: 400 }
      );
    }

    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "配信が見つかりません" },
        { status: 404 }
      );
    }

    const existing = await getPushBroadcastById(id);
    if (!existing) {
      return NextResponse.json(
        { error: "配信が見つかりません" },
        { status: 404 }
      );
    }

    const canceled = await cancelScheduledPushBroadcast(id);
    if (!canceled) {
      return NextResponse.json(
        { error: "送信が始まった配信は取り消せません" },
        { status: 409 }
      );
    }

    await logAdminAction({
      adminUserId: user.id,
      actionType: "push_broadcast_cancel",
      targetType: "admin_push_broadcast",
      targetId: canceled.id,
      metadata: {
        title: canceled.title,
        sendAt: canceled.sendAt,
        announcementId: canceled.announcementId,
      },
    });

    return NextResponse.json(decoratePushBroadcastAdmin(canceled, undefined));
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }

    console.error("[Admin Push Broadcasts] PATCH error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "配信の取り消しに失敗しました",
      },
      { status: 500 }
    );
  }
}
