import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isUserStylesAvailable } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { userStylesRouteCopy } from "@/features/user-styles/lib/route-copy";
import { getUserStylePage } from "@/features/user-styles/lib/get-user-style-page";
import { getPublicUserStylePage } from "@/features/user-styles/lib/get-public-user-style-page";
import {
  USER_STYLE_PAGE_MAX,
  USER_STYLE_PAGE_SIZE,
} from "@/features/user-styles/lib/constants";
import type {
  UserStyleCursor,
  UserStyleSort,
} from "@/features/user-styles/types";
import { UUID_PATTERN } from "@/features/user-styles/lib/validation";

/**
 * User ORIGINAL(/user-styles)の一覧。2ページ目以降とチップ切替後の取り直しに使う。
 *
 * ⭐ **段階公開のゲートはここにも要る。** UI を隠すだけでは、この route を直接
 * 叩けば公開前の一覧が読める（`persta-free-plan-model-lock-ui-only` の教訓）。
 * 使えない相手には 404 を返し、**本文を持たせない**
 * ── 公開前の機能の存在を、失敗の仕方から推測させないため。
 */
export async function GET(request: NextRequest) {
  const copy = userStylesRouteCopy[getRouteLocale(request)];

  try {
    const user = await getUser();
    if (!isUserStylesAvailable(user?.id)) {
      return new NextResponse(null, { status: 404 });
    }

    const params = request.nextUrl.searchParams;

    const limit = Number.parseInt(
      params.get("limit") || String(USER_STYLE_PAGE_SIZE),
      10
    );
    if (!Number.isInteger(limit) || limit < 1 || limit > USER_STYLE_PAGE_MAX) {
      return jsonError(copy.invalidLimit, "USER_STYLES_INVALID_LIMIT", 400);
    }

    // 未知の並びは既定へ倒す（/api/posts と同じ扱い。エラーにしない）。
    const sort: UserStyleSort = params.get("sort") === "usage" ? "usage" : "newest";

    const authorParam = params.get("author");
    if (authorParam !== null && !UUID_PATTERN.test(authorParam)) {
      return jsonError(copy.invalidAuthor, "USER_STYLES_INVALID_AUTHOR", 400);
    }

    /*
      cursor は両方揃っているか、両方無いかのみ許す。
      片方だけ来るのは呼び出し側の取り違えなので、黙って先頭から返さずに落とす
      （黙って返すと「2ページ目を読んだのに1ページ目と同じ」になる）。
    */
    const cursorPostedAt = params.get("cursorPostedAt");
    const cursorId = params.get("cursorId");
    if ((cursorPostedAt === null) !== (cursorId === null)) {
      return jsonError(copy.invalidCursor, "USER_STYLES_INVALID_CURSOR", 400);
    }
    if (cursorId !== null && !UUID_PATTERN.test(cursorId)) {
      return jsonError(copy.invalidCursor, "USER_STYLES_INVALID_CURSOR", 400);
    }
    if (cursorPostedAt !== null && Number.isNaN(Date.parse(cursorPostedAt))) {
      return jsonError(copy.invalidCursor, "USER_STYLES_INVALID_CURSOR", 400);
    }
    /*
      👑 よく使われる は確定順位(position)で続きを読む。並びと cursor の形が
      合わないものは取り違えなので落とす(newest に position、usage に posted_at/id)。
    */
    const cursorPositionParam = params.get("cursorPosition");
    if (sort === "usage" && cursorPostedAt !== null) {
      return jsonError(copy.invalidCursor, "USER_STYLES_INVALID_CURSOR", 400);
    }
    if (sort !== "usage" && cursorPositionParam !== null) {
      return jsonError(copy.invalidCursor, "USER_STYLES_INVALID_CURSOR", 400);
    }
    let cursorPosition: number | null = null;
    if (cursorPositionParam !== null) {
      cursorPosition = Number(cursorPositionParam);
      if (!Number.isInteger(cursorPosition) || cursorPosition < 1) {
        return jsonError(copy.invalidCursor, "USER_STYLES_INVALID_CURSOR", 400);
      }
    }
    // 👑 は作者で絞らない(チップは排他。RPC も作者を受け取らない)
    if (sort === "usage" && authorParam !== null) {
      return jsonError(copy.invalidAuthor, "USER_STYLES_INVALID_AUTHOR", 400);
    }

    const cursor: UserStyleCursor | null =
      cursorPosition !== null
        ? { position: cursorPosition }
        : cursorPostedAt !== null && cursorId !== null
          ? { postedAt: cursorPostedAt, id: cursorId }
          : null;

    /*
      未ログインは閲覧者依存の除外(双方向ブロック・本人の通報)が無いので、
      閲覧者に依らないキャッシュを使い回す。一般公開後は未ログイン・クローラーも
      開くので、毎回 DB を引かないようにする。
      ⭐ ログイン済みには**絶対に使わない**(除外の結果を他人と共有してしまう)。
    */
    const page = user
      ? await getUserStylePage({
          limit,
          sort,
          authorId: authorParam,
          cursor,
          // ⭐ 閲覧者は必ずサーバーで解決する。クエリから受け取ってはいけない
          //    （ブロック・通報の除外基準になるため、偽装できると他人の除外を外せる）。
          currentUserId: user.id,
        })
      : await getPublicUserStylePage({
          limit,
          sort,
          authorId: authorParam,
          cursor,
        });

    return NextResponse.json(page);
  } catch (error) {
    console.error("User styles route error", error);
    return jsonError(copy.internalError, "USER_STYLES_INTERNAL_ERROR", 500);
  }
}
