import { isUserStylesPubliclyEnabled } from "@/lib/env";

/**
 * sitemap にその公開パスを載せてよいか。
 *
 * ⭐ **段階公開中のページを sitemap に載せない。** `app/sitemap.ts` は
 * `LOCALIZED_PUBLIC_PATHS` を**無条件に全ロケールへ展開**するので、配列へ足した
 * 時点で公開前の URL が検索エンジンに載り、クロールされて 404 へ誘導される
 * （PR #638 レビュー#5）。
 *
 * ⭐ **判定に `isUserStylesAvailable`（運営を含む方）を使ってはいけない。**
 * あちらは閲覧者を要求するが、sitemap には閲覧者が居ない。
 * ここは純粋なフラグ判定だけを見る。
 */
export function isSitemapPathEnabled(path: string): boolean {
  if (path === "/user-styles") {
    return isUserStylesPubliclyEnabled();
  }
  return true;
}
