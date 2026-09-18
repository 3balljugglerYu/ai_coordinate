import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { userStylesRouteCopy } from "@/features/user-styles/lib/route-copy";
import { getUserStyleFollowedAuthors } from "@/features/user-styles/lib/get-followed-authors";

/**
 * User ORIGINAL の作者チップ（フォロー中）。
 *
 * ⭐ **未ログインは 401 ではなく空配列。** チップが出ないだけでページは成立するので、
 * ゲストに失敗を見せる理由がない（/styles のお気に入りチップと同じ扱い）。
 */
export async function GET(request: NextRequest) {
  const copy = userStylesRouteCopy[getRouteLocale(request)];

  try {
    const user = await getUser();
    if (!isUserStylesAvailable(user?.id)) {
      return new NextResponse(null, { status: 404 });
    }

    const authors = await getUserStyleFollowedAuthors(user?.id ?? null);
    return NextResponse.json({ authors });
  } catch (error) {
    console.error("User style authors route error", error);
    return jsonError(copy.internalError, "USER_STYLES_INTERNAL_ERROR", 500);
  }
}
