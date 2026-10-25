import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  createTimelineEvent,
  listTimelineEvents,
} from "@/features/admin-dashboard/lib/timeline-event-repository";
import {
  isValidIsoDate,
  validateTimelineEventInput,
} from "@/features/admin-dashboard/lib/admin-list-validation";

/** GET: 出来事の印の一覧(?from=YYYY-MM-DD&to=YYYY-MM-DD で絞れる)。 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;
  if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) {
    return NextResponse.json(
      { error: "日付を YYYY-MM-DD で指定してください" },
      { status: 400 },
    );
  }

  try {
    const events = await listTimelineEvents({ from, to });
    return NextResponse.json(events);
  } catch (error) {
    console.error("[admin timeline-events] GET error:", error);
    return NextResponse.json(
      { error: "出来事の印の取得に失敗しました" },
      { status: 500 },
    );
  }
}

/** POST: 作る({ eventDate, kind, title, note? })。created_by はログイン中の管理者で決める。 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const input = validateTimelineEventInput(body);
  if (!input.ok) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    const event = await createTimelineEvent({
      ...input.value,
      createdBy: adminUser.id,
    });
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "timeline_event_create",
      targetType: "admin_timeline_events",
      targetId: event.id,
      metadata: {
        eventDate: event.eventDate,
        kind: event.kind,
        title: event.title,
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("[admin timeline-events] POST error:", error);
    return NextResponse.json(
      { error: "出来事の印の追加に失敗しました" },
      { status: 500 },
    );
  }
}
