import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAnnouncementsRouteCopy } from "@/features/announcements/lib/route-copy";
import { getAnnouncementUnreadStateForUser } from "@/features/announcements/lib/announcement-repository";

export async function GET(request: NextRequest) {
  await connection();
  const copy = getAnnouncementsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ANNOUNCEMENTS_AUTH_REQUIRED", 401);
    }

    const unreadState = await getAnnouncementUnreadStateForUser(user.id);
    return NextResponse.json(unreadState);
  } catch (error) {
    console.error("[Announcements] GET unread state error:", error);
    return jsonError(
      copy.unreadStateFailed,
      "ANNOUNCEMENTS_UNREAD_STATE_FAILED",
      500
    );
  }
}
