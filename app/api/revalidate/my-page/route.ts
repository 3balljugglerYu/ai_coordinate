import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getRevalidateRouteCopy } from "@/lib/api/revalidate-route-copy";

/**
 * マイページ関連のキャッシュを無効化するAPI
 * 画像削除・投稿取り消し後にクライアントから呼び出し、一覧と詳細を更新する
 */
export async function POST(request: NextRequest) {
  const copy = getRevalidateRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "REVALIDATE_AUTH_REQUIRED", 401);
    }

    let imageId: string | null = null;
    try {
      const body = (await request.json()) as { imageId?: unknown };
      if (typeof body.imageId === "string" && body.imageId.trim()) {
        imageId = body.imageId.trim();
      }
    } catch {
      // body がない場合も一覧の無効化は実行する
    }

    revalidateTag(`my-page-${user.id}`, { expire: 0 });
    revalidatePath("/my-page");

    if (imageId) {
      revalidateTag(`my-page-image-${user.id}-${imageId}`, { expire: 0 });
      revalidatePath(`/my-page/${imageId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revalidate my page error:", error);
    return jsonError(copy.myPageFailed, "REVALIDATE_MY_PAGE_FAILED", 500);
  }
}
