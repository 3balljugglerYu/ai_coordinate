import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { pushBroadcastCreateSchema } from "@/features/push-broadcasts/lib/schema";
import {
  createPushBroadcast,
  listPushBroadcastsForAdmin,
} from "@/features/push-broadcasts/lib/push-broadcast-repository";
import { decoratePushBroadcastAdmin } from "@/features/push-broadcasts/lib/presentation";

/**
 * 予約日時の過去側の許容。画面で「今」に近い日時を選んで保存するまでの遅れは
 * 受け付け（すぐ送る扱い）、それより古いものは入力ミスとして断る。
 */
const PAST_SEND_AT_TOLERANCE_MS = 5 * 60 * 1000;

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
    return NextResponse.json(await listPushBroadcastsForAdmin());
  } catch (error) {
    console.error("[Admin Push Broadcasts] GET error:", error);
    return NextResponse.json(
      { error: "配信履歴の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  try {
    const user = await requireAdmin();
    const payload = pushBroadcastCreateSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      const urlIssue = payload.error.issues.find(
        (issue) => issue.path[0] === "url"
      );
      return NextResponse.json(
        { error: urlIssue?.message ?? "リクエストが不正です" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const sendAtMs = payload.data.sendAt
      ? new Date(payload.data.sendAt).getTime()
      : now;
    if (sendAtMs < now - PAST_SEND_AT_TOLERANCE_MS) {
      return NextResponse.json(
        { error: "送信日時が過去になっています" },
        { status: 400 }
      );
    }

    const created = await createPushBroadcast({
      title: payload.data.title,
      body: payload.data.body,
      url: payload.data.url,
      sendAt: new Date(Math.max(sendAtMs, now)).toISOString(),
      createdBy: user.id,
    });

    await logAdminAction({
      adminUserId: user.id,
      actionType: "push_broadcast_create",
      targetType: "admin_push_broadcast",
      targetId: created.id,
      metadata: {
        title: created.title,
        url: created.url,
        sendAt: created.sendAt,
        immediate: !payload.data.sendAt,
      },
    });

    return NextResponse.json(decoratePushBroadcastAdmin(created, undefined));
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }

    console.error("[Admin Push Broadcasts] POST error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "配信の作成に失敗しました",
      },
      { status: 500 }
    );
  }
}
