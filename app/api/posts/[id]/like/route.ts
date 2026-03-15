import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { toggleLike } from "@/features/posts/lib/server-api";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * いいねの追加・削除API（トグル）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const isLiked = await toggleLike(id, user.id);

    revalidateTag(`post-detail-${id}`, "max");
    return NextResponse.json({ isLiked });
  } catch (error) {
    console.error("Like API error:", error);
    return NextResponse.json(
      {
        error: copy.likeToggleFailed,
        errorCode: "POSTS_LIKE_TOGGLE_FAILED",
      },
      { status: 500 }
    );
  }
}
