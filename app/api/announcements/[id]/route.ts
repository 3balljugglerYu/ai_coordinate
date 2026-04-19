import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAnnouncementsRouteCopy } from "@/features/announcements/lib/route-copy";
import { getPublishedAnnouncementDetailForUser } from "@/features/announcements/lib/announcement-repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getAnnouncementsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ANNOUNCEMENTS_AUTH_REQUIRED", 401);
    }

    const { id } = await params;
    const announcement = await getPublishedAnnouncementDetailForUser(id, user.id);

    if (!announcement) {
      return jsonError(copy.notFound, "ANNOUNCEMENTS_NOT_FOUND", 404);
    }

    return NextResponse.json(announcement);
  } catch (error) {
    console.error("[Announcements] GET detail error:", error);
    return jsonError(
      copy.fetchDetailFailed,
      "ANNOUNCEMENTS_FETCH_DETAIL_FAILED",
      500
    );
  }
}
