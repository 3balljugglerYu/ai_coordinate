import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";

/**
 * 全件既読API
 */
export async function POST(request: NextRequest) {
  const copy = getNotificationsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "NOTIFICATIONS_AUTH_REQUIRED", 401);
    }

    const supabase = await createClient();

    // 現在ユーザーの全通知を既読化
    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("recipient_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("Database query error:", error);
      return jsonError(copy.markAllReadFailed, "NOTIFICATIONS_MARK_ALL_READ_FAILED", 500);
    }

    revalidateTag(`notifications-${user.id}`, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark all read API error:", error);
    return jsonError(copy.markAllReadFailed, "NOTIFICATIONS_MARK_ALL_READ_FAILED", 500);
  }
}
