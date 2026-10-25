import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { isUuid } from "@/lib/is-uuid";
import { removeAnalyticsExclusion } from "@/features/admin-dashboard/lib/analytics-exclusion-repository";

/** DELETE: 集計から除く一覧から外す。 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
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

  const { userId } = await params;
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "ユーザーIDが不正です" }, { status: 400 });
  }

  try {
    const removed = await removeAnalyticsExclusion(userId);
    if (!removed) {
      return NextResponse.json(
        { error: "一覧に入っていません" },
        { status: 404 },
      );
    }
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "analytics_exclusion_remove",
      targetType: "analytics_excluded_users",
      targetId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin analytics-exclusions] DELETE error:", error);
    return NextResponse.json(
      { error: "集計から除く一覧からの削除に失敗しました" },
      { status: 500 },
    );
  }
}
