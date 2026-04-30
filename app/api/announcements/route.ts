import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAnnouncementsRouteCopy } from "@/features/announcements/lib/route-copy";
import { listPublishedAnnouncementsForUser } from "@/features/announcements/lib/announcement-repository";
import { decorateAnnouncementSummary } from "@/features/announcements/lib/presentation";

export async function GET(request: NextRequest) {
  await connection();
  const locale = getRouteLocale(request);
  const copy = getAnnouncementsRouteCopy(locale);

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ANNOUNCEMENTS_AUTH_REQUIRED", 401);
    }

    const announcements = await listPublishedAnnouncementsForUser(user.id);
    return NextResponse.json({
      announcements: announcements.map((announcement) =>
        decorateAnnouncementSummary(announcement, locale)
      ),
    });
  } catch (error) {
    console.error("[Announcements] GET list error:", error);
    return jsonError(
      copy.fetchListFailed,
      "ANNOUNCEMENTS_FETCH_LIST_FAILED",
      500
    );
  }
}
