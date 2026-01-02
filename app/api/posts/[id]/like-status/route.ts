import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getUserLikeStatus } from "@/features/posts/lib/server-api";

/**
 * いいね状態取得API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    const { id } = await params;

    // 未認証の場合はリダイレクトせず401を返す
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    const isLiked = await getUserLikeStatus(id, user.id);

    return NextResponse.json({ isLiked });
  } catch (error) {
    console.error("Like status API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "いいね状態の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}
