import { NextRequest, NextResponse } from "next/server";
import { getUserPostsServer } from "@/features/my-page/lib/server-api";

/**
 * ユーザーの投稿一覧取得API（GET）
 * 認証不要で閲覧可能
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const posts = await getUserPostsServer(userId, limit, offset);

    return NextResponse.json(posts);
  } catch (error) {
    console.error("User posts API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "投稿の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

