import { NextRequest, NextResponse } from "next/server";
import { incrementViewCount } from "@/features/posts/lib/server-api";
import { getPost } from "@/features/posts/lib/server-api";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * 閲覧数をインクリメントするAPI
 * CachedPostDetailでサーバーキャッシュを使用するため、クライアントから呼び出して閲覧数をカウント
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(_request)];
  try {
    const user = await getUser();
    const currentUserId = user?.id ?? null;
    const isAdminViewer =
      !!currentUserId && getAdminUserIds().includes(currentUserId);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    // 投稿が存在し閲覧可能か確認（未投稿・非公開は404）
    // 管理者は getPost 内部の監視権限で閲覧可能
    const post = await getPost(id, currentUserId, true);
    if (!post) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    // 管理者閲覧は監視目的のためカウントしない
    if (isAdminViewer) {
      return NextResponse.json({ success: true, counted: false });
    }

    await incrementViewCount(id);
    return NextResponse.json({ success: true, counted: true });
  } catch (error) {
    console.error("View count API error:", error);
    return NextResponse.json(
      {
        error: copy.viewCountUpdateFailed,
        errorCode: "POSTS_VIEW_COUNT_UPDATE_FAILED",
      },
      { status: 500 }
    );
  }
}
