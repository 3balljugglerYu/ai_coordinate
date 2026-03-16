import { NextRequest, NextResponse } from "next/server";
import { getPosts } from "@/features/posts/lib/server-api";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * 投稿一覧取得API
 */
export async function GET(request: NextRequest) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sort = searchParams.get("sort") || "newest";

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: copy.invalidLimit, errorCode: "POSTS_INVALID_LIMIT" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: copy.invalidOffset, errorCode: "POSTS_INVALID_OFFSET" },
        { status: 400 }
      );
    }

    const validSorts = ["newest", "following", "daily", "week", "month", "popular"];
    const sortType = validSorts.includes(sort) ? (sort as "newest" | "following" | "daily" | "week" | "month" | "popular") : "newest";
    
    // 検索クエリを取得（空文字列の場合はundefinedとして扱う）
    const searchQuery = searchParams.get("q");
    const normalizedSearchQuery = searchQuery?.trim() || undefined;
    
    const posts = await getPosts(limit, offset, sortType, normalizedSearchQuery);

    return NextResponse.json({
      posts,
      hasMore: posts.length === limit,
    });
  } catch (error) {
    console.error("Posts API error:", error);
    return NextResponse.json(
      {
        error: copy.postsFetchFailed,
        errorCode: "POSTS_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}
