import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAnnouncementsRouteCopy } from "@/features/announcements/lib/route-copy";
import {
  announcementSeenRequestSchema,
} from "@/features/announcements/lib/schema";
import { setAnnouncementSeenSurfaceForUser } from "@/features/announcements/lib/announcement-repository";

export async function POST(request: NextRequest) {
  const copy = getAnnouncementsRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "ANNOUNCEMENTS_AUTH_REQUIRED", 401);
    }

    const payload = announcementSeenRequestSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!payload.success) {
      return jsonError(copy.invalidRequest, "ANNOUNCEMENTS_INVALID_REQUEST", 400);
    }

    const seenAt = await setAnnouncementSeenSurfaceForUser(
      user.id,
      payload.data.surface
    );
    return NextResponse.json({ success: true, seenAt });
  } catch (error) {
    console.error("[Announcements] POST seen error:", error);
    return jsonError(
      copy.markSeenFailed,
      "ANNOUNCEMENTS_MARK_SEEN_FAILED",
      500
    );
  }
}
