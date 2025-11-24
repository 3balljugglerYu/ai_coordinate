import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUserLikeStatus } from "@/features/posts/lib/server-api";

/**
 * いいね状態取得API
 */
export async function GET(
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

