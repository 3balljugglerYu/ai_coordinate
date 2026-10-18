import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";
import { fetchNotificationsPage } from "@/features/notifications/lib/server-api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 通知一覧取得API
 */
export async function GET(request: NextRequest) {
  await connection();
  const copy = getNotificationsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "NOTIFICATIONS_AUTH_REQUIRED", 401);
    }
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // 数字でない limit(NaN)は範囲の比較をすり抜けるので、整数かどうかも見る
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return jsonError(copy.invalidLimit, "NOTIFICATIONS_INVALID_LIMIT", 400);
    }

    const supabase = await createClient();

    // Realtime 新着の enrichment 用の単一取得 (REQ-006)。
    // 件数窓（直近N件）方式はバースト時に対象を取り逃がすため ID で引く。
    // recipient_id を本人へ固定するため、id を知っていても他人の通知は取れない。
    const idParam = searchParams.get("id");
    if (idParam && !UUID_PATTERN.test(idParam)) {
      return jsonError(copy.fetchFailed, "NOTIFICATIONS_INVALID_ID", 400);
    }

    // 一覧・相手のプロフィール・投稿のサムネイルを 1 回で取る
    // (get_notifications_page)。読めないカーソルは無視して先頭から返す。
    const result = await fetchNotificationsPage(supabase, {
      userId: user.id,
      limit: idParam ? 1 : limit,
      cursor: idParam ? null : searchParams.get("cursor"),
      notificationId: idParam,
    });

    if (!result.ok) {
      console.error("Database query error:", result.error);
      return jsonError(copy.fetchFailed, "NOTIFICATIONS_FETCH_FAILED", 500);
    }

    return NextResponse.json({
      notifications: result.notifications,
      nextCursor: idParam ? null : result.nextCursor,
    });
  } catch (error) {
    console.error("Notifications API error:", error);
    return jsonError(copy.fetchFailed, "NOTIFICATIONS_FETCH_FAILED", 500);
  }
}
