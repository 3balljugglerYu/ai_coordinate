import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { isUuid } from "@/lib/is-uuid";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";

/**
 * 個人あてのお知らせの詳細ページを開いた記録(初回の時刻と既読)。
 * 本人の・取り消していない行だけ(RPC がセッションの user_id で絞る)。
 * 計画書 docs/planning/personal-notices-implementation-plan.md PN-011
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  const copy = getNotificationsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "NOTIFICATIONS_AUTH_REQUIRED", 401);
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return jsonError(copy.markReadFailed, "NOTIFICATIONS_INVALID_ID", 400);
    }

    const { data: found, error } = await createAdminClient().rpc(
      "mark_personal_notice_opened",
      { p_user_id: user.id, p_notification_id: id }
    );

    if (error) {
      console.error("[Notifications] mark personal notice opened error:", error);
      return jsonError(copy.markReadFailed, "NOTIFICATIONS_MARK_READ_FAILED", 500);
    }
    if (found !== true) {
      return jsonError(copy.markReadFailed, "NOTIFICATIONS_NOT_FOUND", 404);
    }

    revalidateTag(`notifications-${user.id}`, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notifications] mark personal notice opened error:", error);
    return jsonError(copy.markReadFailed, "NOTIFICATIONS_MARK_READ_FAILED", 500);
  }
}
