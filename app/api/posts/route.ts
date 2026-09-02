import { NextRequest, NextResponse } from "next/server";
import { getPosts } from "@/features/posts/lib/server-api";
import type { SortType } from "@/features/posts/types";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";
import { getUser } from "@/lib/auth";
import { getPopularPrompts } from "@/features/posts/lib/popular-prompts-api";
import {
  isPopularPromptsAvailable,
  isSearchAvailable,
  isSearchPubliclyEnabled,
} from "@/lib/env";

/**
 * 投稿一覧取得API
 */
export async function GET(request: NextRequest) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sort = searchParams.get("sort") || "newest";

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: copy.invalidLimit, errorCode: "POSTS_INVALID_LIMIT" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: copy.invalidOffset, errorCode: "POSTS_INVALID_OFFSET" },
        { status: 400 }
      );
    }

    const validSorts: SortType[] = [
      "newest",
      "following",
      "daily",
      "week",
      "month",
      "popular",
      "popular_prompts",
    ];
    let sortType: SortType = validSorts.includes(sort as SortType)
      ? (sort as SortType)
      : "newest";
    
    // 検索クエリを取得（空文字列の場合はundefinedとして扱う）
    const searchQuery = searchParams.get("q");
    let normalizedSearchQuery = searchQuery?.trim() || undefined;

    /*
      段階公開は UI を閉じるだけでは足りない（REQ-06b）。この API は認証不要で
      `q` を受けるため、ヘッダーの検索バーを隠しても直接叩けば検索できてしまう。
      許可されていない相手には `q` を無視して通常の一覧を返す（エラーにはしない。
      公開前の機能の存在を、失敗の仕方から推測させないため）。
    */
    if (normalizedSearchQuery && !isSearchPubliclyEnabled()) {
      let viewerId: string | null = null;
      try {
        viewerId = (await getUser())?.id ?? null;
      } catch (error) {
        // 認証が引けないときは検索を許可しない（閉じる側に倒す）。
        // 一覧そのものは未認証でも返せるので、リクエストは落とさない。
        console.error("Search authorization check failed:", error);
      }
      if (!isSearchAvailable(viewerId)) {
        normalizedSearchQuery = undefined;
      }
    }

    /*
      🔥人気のプロンプトも検索と同じ段階公開で、判定は isPopularPromptsAvailable に
      一本化している(ADR-006)。UI のタブを隠すだけでは足りない。この API は
      認証不要で `sort` を受けるため、直接叩けば未公開の順位が取れてしまう。
      許可されていない相手には `sort` を無視して新着順を返す(エラーにはしない。
      公開前の機能の存在を、失敗の仕方から推測させないため)。
    */
    let popularPromptsViewerId: string | null = null;
    if (sortType === "popular_prompts") {
      try {
        popularPromptsViewerId = (await getUser())?.id ?? null;
      } catch (error) {
        // 認証が引けないときは閉じる側に倒す。一覧そのものは返せるのでリクエストは落とさない。
        console.error("Popular prompts authorization check failed:", error);
      }
      // 判定はこの 1 本だけ(= 公開フラグ or 運営)。検索のように getUser() を
      // 省略する余地は無い。ブロック・通報の除外に閲覧者 ID が要るためである。
      if (!isPopularPromptsAvailable(popularPromptsViewerId)) {
        sortType = "newest";
        popularPromptsViewerId = null;
      }
    }

    /*
      ⭐ validSorts に足すだけでは新着順が返るだけで、人気のプロンプトには到達しない。
      この API は getPosts しか呼んでいないので、明示的に分岐させる必要がある。
    */
    const posts =
      sortType === "popular_prompts"
        ? await getPopularPrompts(limit, offset, popularPromptsViewerId)
        : await getPosts(limit, offset, sortType, normalizedSearchQuery);

    return NextResponse.json({
      posts,
      hasMore: posts.length === limit,
    });
  } catch (error) {
    console.error("Posts API error:", error);
    return NextResponse.json(
      {
        error: copy.postsFetchFailed,
        errorCode: "POSTS_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}
