import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";
import { enrichNotificationsWithDetails } from "@/features/notifications/lib/server-api";

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
    const cursor = searchParams.get("cursor");

    if (limit < 1 || limit > 100) {
      return jsonError(copy.invalidLimit, "NOTIFICATIONS_INVALID_LIMIT", 400);
    }

    const supabase = await createClient();

    // 通知一覧を取得するクエリを構築
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1); // 次のページがあるか確認するため+1

    // カーソルがある場合はフィルタを追加
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString();
        const [cursorCreatedAt, cursorId] = decoded.split("|");

        if (cursorCreatedAt && cursorId) {
          // created_at < cursor_created_at OR (created_at = cursor_created_at AND id < cursor_id)
          // Supabaseのor構文を使用
          query = query.or(
            `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
          );
        }
      } catch (error) {
        console.error("Failed to decode cursor:", error);
        // カーソルのデコードに失敗した場合は無視して続行
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Database query error:", error);
      return jsonError(copy.fetchFailed, "NOTIFICATIONS_FETCH_FAILED", 500);
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        notifications: [],
        nextCursor: null,
      });
    }

    // 次のページがあるか確認
    const hasNextPage = data.length > limit;
    const notifications = hasNextPage ? data.slice(0, limit) : data;

    // 次のカーソルを生成
    let nextCursor: string | null = null;
    if (hasNextPage && notifications.length > 0) {
      const lastNotification = notifications[notifications.length - 1];
      const cursorString = `${lastNotification.created_at}|${lastNotification.id}`;
      nextCursor = Buffer.from(cursorString).toString("base64");
    }

    const notificationsWithDetails = await enrichNotificationsWithDetails(
      supabase,
      notifications
    );

    return NextResponse.json({
      notifications: notificationsWithDetails,
      nextCursor,
    });
  } catch (error) {
    console.error("Notifications API error:", error);
    return jsonError(copy.fetchFailed, "NOTIFICATIONS_FETCH_FAILED", 500);
  }
}
