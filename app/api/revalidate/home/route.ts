import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getRevalidateRouteCopy } from "@/lib/api/revalidate-route-copy";

/**
 * ホーム画面のキャッシュを無効化するAPI
 * 投稿完了時にクライアントから呼び出し、投稿一覧を更新する
 */
export async function POST(request: NextRequest) {
  const copy = getRevalidateRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "REVALIDATE_AUTH_REQUIRED", 401);
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidatePath("/");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revalidate home error:", error);
    return jsonError(copy.homeFailed, "REVALIDATE_HOME_FAILED", 500);
  }
}
