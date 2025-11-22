import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { toggleLike } from "@/features/posts/lib/server-api";

/**
 * いいねの追加・削除API（トグル）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    const isLiked = await toggleLike(id, user.id);

    return NextResponse.json({ isLiked });
  } catch (error) {
    console.error("Like API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "いいねの処理に失敗しました",
      },
      { status: 500 }
    );
  }
}

