import { NextRequest, NextResponse } from "next/server";
import { getLikeCountsBatch } from "@/features/posts/lib/server-api";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * いいね数の一括取得API（バッチ、特殊用途向け）
 */
export async function POST(request: NextRequest) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const body = await request.json();
    const { imageIds } = body;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { error: copy.invalidImageIds, errorCode: "POSTS_INVALID_IMAGE_IDS" },
        { status: 400 }
      );
    }

    if (imageIds.length > 100) {
      return NextResponse.json(
        { error: copy.batchSizeExceeded, errorCode: "POSTS_BATCH_SIZE_EXCEEDED" },
        { status: 400 }
      );
    }

    const counts = await getLikeCountsBatch(imageIds);

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Batch likes API error:", error);
    return NextResponse.json(
      {
        error: copy.likeCountsBatchFetchFailed,
        errorCode: "POSTS_LIKE_COUNTS_BATCH_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}
