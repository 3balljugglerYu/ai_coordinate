import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAnnouncementsRouteCopy } from "@/features/announcements/lib/route-copy";
import { listPublishedAnnouncementsForUser } from "@/features/announcements/lib/announcement-repository";

export async function GET(request: NextRequest) {
  const copy = getAnnouncementsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ANNOUNCEMENTS_AUTH_REQUIRED", 401);
    }

    const announcements = await listPublishedAnnouncementsForUser(user.id);
    return NextResponse.json({ announcements });
  } catch (error) {
    console.error("[Announcements] GET list error:", error);
    return jsonError(
      copy.fetchListFailed,
      "ANNOUNCEMENTS_FETCH_LIST_FAILED",
      500
    );
  }
}
