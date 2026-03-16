import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";

/**
 * 未読数取得API
 * 未認証の場合は401を返す（redirectではなく）
 */
export async function GET(_request: NextRequest) {
  const copy = getNotificationsRouteCopy(getRouteLocale(_request));

  try {
    const user = await getUser();

    if (!user) {
      return jsonError(copy.authRequired, "NOTIFICATIONS_AUTH_REQUIRED", 401);
    }

    const supabase = await createClient();

    // 未読数を取得
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("Database query error:", error);
      return jsonError(copy.unreadCountFailed, "NOTIFICATIONS_UNREAD_COUNT_FAILED", 500);
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error("Unread count API error:", error);
    return jsonError(copy.unreadCountFailed, "NOTIFICATIONS_UNREAD_COUNT_FAILED", 500);
  }
}
