import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
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
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

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
      // 予約中ではなかった。読み直して、今の状態に合った文を返す
      // （開いたままの画面で、ほかの画面から取り消し済みのものを押した等）
      const current = (await getPushBroadcastById(id)) ?? existing;
      if (current.status === "canceled") {
        return NextResponse.json(decoratePushBroadcastAdmin(current, undefined));
      }
      return NextResponse.json(
        {
          error:
            current.status === "expired"
              ? "送信日時から 1 時間を過ぎて期限切れになった配信は取り消せません"
              : "送信が始まった配信は取り消せません",
        },
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
