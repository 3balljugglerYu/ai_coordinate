import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { unpostImageServer } from "@/features/generation/lib/server-database";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * 投稿取り消しAPI（投稿詳細画面から）
 * 投稿一覧からは削除されるが、マイページには残る
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    await unpostImageServer(id, user.id);

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    // 投稿取り消し直後の詳細画面は stale を返さないように即時失効する
    revalidateTag(`post-detail-${id}`, { expire: 0 });
    revalidateTag(`user-profile-${user.id}`, "max");
    revalidateTag(`my-page-${user.id}`, "max");
    revalidateTag(`my-page-image-${user.id}-${id}`, { expire: 0 });
    revalidatePath("/");
    revalidatePath(`/posts/${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unpost API error:", error);
    return NextResponse.json(
      {
        error: copy.deleteFailed,
        errorCode: "POSTS_DELETE_FAILED",
      },
      { status: 500 }
    );
  }
}
