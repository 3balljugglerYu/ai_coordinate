import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getUserLikeStatus } from "@/features/posts/lib/server-api";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * いいね状態取得API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    const { id } = await params;

    // 未認証の場合はリダイレクトせず401を返す
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const isLiked = await getUserLikeStatus(id, user.id);

    return NextResponse.json({ isLiked });
  } catch (error) {
    console.error("Like status API error:", error);
    return NextResponse.json(
      {
        error: copy.likeStatusFetchFailed,
        errorCode: "POSTS_LIKE_STATUS_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}
