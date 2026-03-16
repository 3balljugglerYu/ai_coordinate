import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getMyImagesServer } from "@/features/my-page/lib/server-api";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getMyPageRouteCopy } from "@/features/my-page/lib/route-copy";

/**
 * マイページ画像一覧取得API
 */
export async function GET(request: NextRequest) {
  const copy = getMyPageRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "MY_PAGE_AUTH_REQUIRED", 401);
    }
    const searchParams = request.nextUrl.searchParams;
    const filter = (searchParams.get("filter") || "all") as "all" | "posted" | "unposted";
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const images = await getMyImagesServer(user.id, filter, limit, offset);

    return NextResponse.json({
      images,
      hasMore: images.length === limit,
    });
  } catch (error) {
    console.error("My page images API error:", error);
    return jsonError(copy.imageFetchFailed, "MY_PAGE_IMAGES_FETCH_FAILED", 500);
  }
}
