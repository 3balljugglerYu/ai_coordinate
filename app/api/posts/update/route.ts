import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * キャプション更新API
 */
export async function PUT(request: NextRequest) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, caption } = body;

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    // キャプション更新処理
    const result = await postImageServer(id, caption);

    // 注意: デイリーボーナスは新しい投稿（POST /api/posts/post）でのみ付与されます
    // キャプション更新（PUT /api/posts/update）ではボーナスを付与しません

    if (result.id) {
      // 詳細画面はキャプション更新直後に stale を返さないようにする
      revalidateTag(`post-detail-${result.id}`, { expire: 0 });
    }
    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    if (result.user_id) {
      revalidateTag(`my-page-image-${result.user_id}-${result.id}`, {
        expire: 0,
      });
    }

    return NextResponse.json({
      id: result.id!,
      is_posted: result.is_posted,
      caption: result.caption ?? null,
      posted_at: result.posted_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update API error:", error);
    return NextResponse.json(
      {
        error: copy.updateFailed,
        errorCode: "POSTS_UPDATE_FAILED",
      },
      { status: 500 }
    );
  }
}
