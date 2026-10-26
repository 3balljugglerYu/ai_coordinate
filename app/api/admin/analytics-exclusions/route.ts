import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { isUuid } from "@/lib/is-uuid";
import {
  AnalyticsExclusionExistsError,
  addAnalyticsExclusion,
  listAnalyticsExclusions,
  profileExistsForExclusion,
} from "@/features/admin-dashboard/lib/analytics-exclusion-repository";
import { validateExclusionReason } from "@/features/admin-dashboard/lib/admin-list-validation";

/** GET: 集計から除く一覧。 */
export async function GET() {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  try {
    const exclusions = await listAnalyticsExclusions();
    return NextResponse.json(exclusions);
  } catch (error) {
    console.error("[admin analytics-exclusions] GET error:", error);
    return NextResponse.json(
      { error: "集計から除く一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

/** POST: 足す({ userId, reason })。added_by はログイン中の管理者で決める。 */
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

  const userId =
    typeof (body as { userId?: unknown })?.userId === "string"
      ? (body as { userId: string }).userId
      : "";
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "ユーザーIDが不正です" }, { status: 400 });
  }
  const reason = validateExclusionReason((body as { reason?: unknown })?.reason);
  if (!reason.ok) {
    return NextResponse.json({ error: reason.error }, { status: 400 });
  }

  try {
    if (!(await profileExistsForExclusion(userId))) {
      return NextResponse.json(
        { error: "該当するユーザーが見つかりません" },
        { status: 400 },
      );
    }

    await addAnalyticsExclusion({
      userId,
      reason: reason.value,
      addedBy: adminUser.id,
    });
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "analytics_exclusion_add",
      targetType: "analytics_excluded_users",
      targetId: userId,
      metadata: { reason: reason.value },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AnalyticsExclusionExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[admin analytics-exclusions] POST error:", error);
    return NextResponse.json(
      { error: "集計から除く一覧への追加に失敗しました" },
      { status: 500 },
    );
  }
}
