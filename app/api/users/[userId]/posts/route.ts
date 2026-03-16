import { NextRequest, NextResponse } from "next/server";
import { getUserPostsServer } from "@/features/my-page/lib/server-api";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getUserRouteCopy } from "@/features/users/lib/route-copy";

/**
 * ユーザーの投稿一覧取得API（GET）
 * 認証不要で閲覧可能
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const copy = getUserRouteCopy(getRouteLocale(request));

  try {
    const { userId } = await params;

    if (!userId) {
      return jsonError(copy.userIdRequired, "USER_ID_REQUIRED", 400);
    }

    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const posts = await getUserPostsServer(userId, limit, offset);

    return NextResponse.json(posts);
  } catch (error) {
    console.error("User posts API error:", error);
    return jsonError(copy.postsFetchFailed, "USER_POSTS_FETCH_FAILED", 500);
  }
}
