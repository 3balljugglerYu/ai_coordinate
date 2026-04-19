import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAnnouncementsRouteCopy } from "@/features/announcements/lib/route-copy";
import {
  getPublishedAnnouncementDetailForUser,
  markAnnouncementReadForUser,
} from "@/features/announcements/lib/announcement-repository";

export async function POST(
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

    await markAnnouncementReadForUser(id, user.id);
    revalidateTag(`announcements-${user.id}`, { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Announcements] POST read error:", error);
    return jsonError(
      copy.markReadFailed,
      "ANNOUNCEMENTS_MARK_READ_FAILED",
      500
    );
  }
}
