import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { isUuid } from "@/lib/is-uuid";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";
import { getPersonalNoticeDetailForUser } from "@/features/notifications/lib/personal-notice-detail";

/**
 * 個人あてのお知らせの詳細(アプリ用)。Web の詳細ページと同じ値を JSON で返す。
 * 中身は運営だけが書ける記録の表から読む(通知の行は本人が書き換えられるため)。
 * 本人以外・取り消し済みは 404。
 * 計画書 docs/planning/personal-notices-implementation-plan.md PN-010 / PN-012
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const locale = getRouteLocale(request);
  const copy = getNotificationsRouteCopy(locale);

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "NOTIFICATIONS_AUTH_REQUIRED", 401);
    }

    const { id } = await params;
    if (!isUuid(id)) {
      return jsonError(copy.notFound, "NOTIFICATIONS_INVALID_ID", 400);
    }

    const notice = await getPersonalNoticeDetailForUser(createAdminClient(), {
      notificationId: id,
      userId: user.id,
      locale,
    });
    if (!notice) {
      return jsonError(copy.notFound, "NOTIFICATIONS_NOT_FOUND", 404);
    }

    return NextResponse.json({ notice });
  } catch (error) {
    console.error("[Notifications] personal notice detail error:", error);
    return jsonError(copy.fetchFailed, "NOTIFICATIONS_FETCH_FAILED", 500);
  }
}
