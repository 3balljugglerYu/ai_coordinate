import type { UserStyleChipId } from "@/features/user-styles/components/UserStyleChips";
import type { UserStyleAuthor } from "@/features/user-styles/types";

/**
 * /user-styles のチップ(カタログ刷新後はタブ)の ID を、画面の並び順どおりに返す。
 * 一覧の横スワイプ(`CatalogSwipePanel`)で隣のタブを決めるのに使う。
 *
 * ⭐ `UserStyleChips` の並び(✨すべて → 💖みんなが使ってる → フォロー中の作者)と
 * 必ず同じ順にすること。ずれると、スワイプで画面上の隣とは違うタブへ移る。
 */
export function userStyleChipIds(authors: UserStyleAuthor[]): UserStyleChipId[] {
  return [
    "all",
    "usage",
    ...authors.map((author): UserStyleChipId => `author:${author.authorId}`),
  ];
}
