import { NextRequest, NextResponse } from "next/server";
import { getPosts } from "@/features/posts/lib/server-api";

/**
 * 投稿一覧取得API
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sort = searchParams.get("sort") || "newest";

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    const validSorts = ["newest", "following", "daily", "week", "month"];
    const sortType = validSorts.includes(sort) ? (sort as "newest" | "following" | "daily" | "week" | "month") : "newest";
    
    const posts = await getPosts(limit, offset, sortType);

    return NextResponse.json({
      posts,
      hasMore: posts.length === limit,
    });
  } catch (error) {
    console.error("Posts API error:", error);
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

