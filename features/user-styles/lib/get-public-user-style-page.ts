import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getUserStylePage } from "@/features/user-styles/lib/get-user-style-page";
import type { UserStylePage } from "@/features/user-styles/types";

/** `"use cache"` の失効タグ。将来の明示的な revalidate 用に名前を切っておく。 */
export const USER_STYLES_CACHE_TAG = "user-styles";

async function getPublicUserStyleFirstPageCached(): Promise<UserStylePage> {
  "use cache";
  cacheTag(USER_STYLES_CACHE_TAG);
  cacheLife("minutes");

  return getUserStylePage({ currentUserId: null });
}

/**
 * **閲覧者に依らない**1ページ目。
 *
 * 用途は2つ。
 *
 *   1. JSON-LD（検索エンジンに出す一覧が閲覧者によって変わらないようにする。
 *      `/styles` が JSON-LD を公開分だけで組むのと同じ方針）
 *   2. 未ログインの一覧そのもの（除外の基準になる閲覧者が居ないので同じ結果になる）
 *
 * ⭐ **ログイン済みの一覧にこれを使ってはいけない。** 双方向ブロックと本人の通報は
 * 閲覧者ごとに違うので、キャッシュを共有すると他人の除外結果を見せることになる。
 * ログイン済みは `getUserStylePage({ currentUserId })` を直接呼ぶこと。
 *
 * ⭐ 明示的な失効は用意していない。投稿は常時増えるので `cacheLife("minutes")` で
 * 追従すれば足りる（数分の遅れは「新着順の棚」として許容できる）。
 */
export async function getPublicUserStyleFirstPage(): Promise<UserStylePage> {
  return getPublicUserStyleFirstPageCached();
}
