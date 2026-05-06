import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getRevalidateRouteCopy } from "@/lib/api/revalidate-route-copy";

/**
 * /style 画面のキャッシュを無効化する API。
 * one_tap_style 画像の生成完了時にクライアントから呼び出し、
 * 生成結果一覧を更新する。/api/revalidate/coordinate と同型。
 */
export async function POST(request: NextRequest) {
  const copy = getRevalidateRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "REVALIDATE_AUTH_REQUIRED", 401);
    }

    revalidateTag(`style-${user.id}`, "max");
    revalidatePath("/style");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revalidate style error:", error);
    return jsonError(copy.styleFailed, "REVALIDATE_STYLE_FAILED", 500);
  }
}
