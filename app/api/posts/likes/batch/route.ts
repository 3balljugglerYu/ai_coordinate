import { NextRequest, NextResponse } from "next/server";
import { getLikeCountsBatch } from "@/features/posts/lib/server-api";

/**
 * いいね数の一括取得API（バッチ、特殊用途向け）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageIds } = body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { error: "imageIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (imageIds.length > 100) {
      return NextResponse.json(
        { error: "Batch size must be 100 or less" },
        { status: 400 }
      );
    }

    const counts = await getLikeCountsBatch(imageIds);

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Batch likes API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "いいね数の一括取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

