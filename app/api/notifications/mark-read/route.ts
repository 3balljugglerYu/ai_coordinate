import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getNotificationsRouteCopy } from "@/features/notifications/lib/route-copy";

/**
 * 通知既読API
 */
export async function POST(request: NextRequest) {
  const copy = getNotificationsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "NOTIFICATIONS_AUTH_REQUIRED", 401);
    }
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return jsonError(copy.idsRequired, "NOTIFICATIONS_IDS_REQUIRED", 400);
    }

    if (ids.length > 100) {
      return jsonError(copy.maxIdsExceeded, "NOTIFICATIONS_MAX_IDS_EXCEEDED", 400);
    }

    const supabase = await createClient();

    // 指定IDの通知を既読化
    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("recipient_id", user.id)
      .in("id", ids);

    if (error) {
      console.error("Database query error:", error);
      return jsonError(copy.markReadFailed, "NOTIFICATIONS_MARK_READ_FAILED", 500);
    }

    revalidateTag(`notifications-${user.id}`, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark read API error:", error);
    return jsonError(copy.markReadFailed, "NOTIFICATIONS_MARK_READ_FAILED", 500);
  }
}
