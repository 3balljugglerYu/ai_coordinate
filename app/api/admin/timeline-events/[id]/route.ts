import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { isUuid } from "@/lib/is-uuid";
import {
  deleteTimelineEvent,
  updateTimelineEvent,
} from "@/features/admin-dashboard/lib/timeline-event-repository";
import { validateTimelineEventInput } from "@/features/admin-dashboard/lib/admin-list-validation";

/** PATCH: 直す(送った項目だけ)。 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const patch = validateTimelineEventInput(body, { partial: true });
  if (!patch.ok) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  try {
    const event = await updateTimelineEvent(id, patch.value);
    if (!event) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "timeline_event_update",
      targetType: "admin_timeline_events",
      targetId: id,
      metadata: { fields: Object.keys(patch.value) },
    });
    return NextResponse.json(event);
  } catch (error) {
    console.error("[admin timeline-events] PATCH error:", error);
    return NextResponse.json(
      { error: "出来事の印の更新に失敗しました" },
      { status: 500 },
    );
  }
}

/** DELETE: 消す。 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
  }

  try {
    const deleted = await deleteTimelineEvent(id);
    if (!deleted) {
      return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    }
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "timeline_event_delete",
      targetType: "admin_timeline_events",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin timeline-events] DELETE error:", error);
    return NextResponse.json(
      { error: "出来事の印の削除に失敗しました" },
      { status: 500 },
    );
  }
}
