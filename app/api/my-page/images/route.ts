import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getMyImagesServer } from "@/features/my-page/lib/server-api";

/**
 * マイページ画像一覧取得API
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const filter = (searchParams.get("filter") || "all") as "all" | "posted" | "unposted";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const images = await getMyImagesServer(user.id, filter, limit, offset);

    return NextResponse.json({
      images,
      hasMore: images.length === limit,
    });
  } catch (error) {
    console.error("My page images API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "画像の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

