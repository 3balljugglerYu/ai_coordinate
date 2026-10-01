import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
  fetchUserStylePage,
  UserStylePageFetchError,
} from "@/features/user-styles/lib/get-user-style-page";
import type {
  UserStyleCursor,
  UserStylePage,
  UserStyleSort,
} from "@/features/user-styles/types";

/** `"use cache"` の失効タグ。将来の明示的な revalidate 用に名前を切っておく。 */
export const USER_STYLES_CACHE_TAG = "user-styles";

/**
 * ⭐ 引数はキャッシュのキーになる。閲覧者は**受け取らない**(常に未ログイン扱い)。
 * 読めなければ `fetchUserStylePage` が投げるので、失敗は覚えない
 * (空を返すと、一時的な失敗が「空の一覧」として数分間全員に出続ける)。
 */
async function getPublicUserStylePageCached(
  sort: UserStyleSort,
  authorId: string | null,
  cursor: UserStyleCursor | null,
  limit: number | null
): Promise<UserStylePage> {
  "use cache";
  cacheTag(USER_STYLES_CACHE_TAG);
  cacheLife("minutes");

  return fetchUserStylePage({
    sort,
    authorId,
    cursor,
    limit: limit ?? undefined,
    currentUserId: null,
  });
}

export interface PublicUserStylePageParams {
  sort?: UserStyleSort;
  authorId?: string | null;
  cursor?: UserStyleCursor | null;
  limit?: number;
}

/**
 * **閲覧者に依らない**1ページ。未ログインの一覧と JSON-LD に使う。
 *
 * 用途は3つ。
 *
 *   1. JSON-LD（検索エンジンに出す一覧が閲覧者によって変わらないようにする。
 *      `/styles` が JSON-LD を公開分だけで組むのと同じ方針）
 *   2. 未ログインの一覧の1ページ目（除外の基準になる閲覧者が居ないので同じ結果になる）
 *   3. 未ログインの2ページ目以降・チップ切替・隣のタブの先読み(`/api/user-styles`)。
 *      一般公開後は未ログイン・クローラーも開くので、毎回 DB を引かないよう使い回す
 *
 * ⭐ **ログイン済みの一覧にこれを使ってはいけない。** 双方向ブロックと本人の通報は
 * 閲覧者ごとに違うので、キャッシュを共有すると他人の除外結果を見せることになる。
 * ログイン済みは `getUserStylePage({ currentUserId })` を直接呼ぶこと。
 *
 * ⭐ 明示的な失効は用意していない。投稿は常時増えるので `cacheLife("minutes")` で
 * 追従すれば足りる（数分の遅れは「新着順の棚」として許容できる）。
 *
 * 読めなければ空(fail closed。`getUserStylePage` と同じ)。失敗はキャッシュしない。
 */
export async function getPublicUserStylePage({
  sort = "newest",
  authorId = null,
  cursor = null,
  limit,
}: PublicUserStylePageParams = {}): Promise<UserStylePage> {
  try {
    return await getPublicUserStylePageCached(
      sort,
      authorId,
      cursor,
      limit ?? null
    );
  } catch (error) {
    if (error instanceof UserStylePageFetchError) {
      return { posts: [], nextCursor: null };
    }
    throw error;
  }
}

/** 未ログインの1ページ目(新着順)。JSON-LD と `/user-styles` の初期表示に使う。 */
export async function getPublicUserStyleFirstPage(): Promise<UserStylePage> {
  return getPublicUserStylePage();
}
