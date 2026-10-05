import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { userStylesRouteCopy } from "@/features/user-styles/lib/route-copy";
import {
  getUserStyleFollowedAuthors,
  getUserStyleOwnAuthor,
} from "@/features/user-styles/lib/get-followed-authors";

/**
 * User ORIGINAL の作者チップ（自分 → フォロー中）。
 *
 * 自分のチップは、みんなのカタログに並ぶ自分の投稿があるときだけ先頭に出す(2026-10-05)。
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

    const [own, followed] = await Promise.all([
      getUserStyleOwnAuthor(user?.id ?? null),
      getUserStyleFollowedAuthors(user?.id ?? null),
    ]);
    // 自分は先頭。フォロー中の一覧に自分が混ざることは無いが、念のため重ねない
    const authors = own
      ? [own, ...followed.filter((author) => author.authorId !== own.authorId)]
      : followed;
    return NextResponse.json({ authors });
  } catch (error) {
    console.error("User style authors route error", error);
    return jsonError(copy.internalError, "USER_STYLES_INTERNAL_ERROR", 500);
  }
}
