import { NextRequest, NextResponse } from "next/server";
import { incrementViewCount } from "@/features/posts/lib/server-api";
import { getPost } from "@/features/posts/lib/server-api";

/**
 * 閲覧数をインクリメントするAPI
 * CachedPostDetailでサーバーキャッシュを使用するため、クライアントから呼び出して閲覧数をカウント
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // 投稿が存在し閲覧可能か確認（未投稿・非公開は404）
    const post = await getPost(id, null, true);
    if (!post) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    await incrementViewCount(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("View count API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "閲覧数の更新に失敗しました",
      },
      { status: 500 }
    );
  }
}
