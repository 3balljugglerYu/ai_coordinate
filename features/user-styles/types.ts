import type { Post } from "@/features/posts/types";

/** /user-styles の並び。チップの選択がそのままこの値になる。 */
export type UserStyleSort = "newest" | "usage";

/**
 * 次ページの開始位置。
 *
 * ⭐ **offset ではなく keyset。** offset だと1ページ目の表示中に新規投稿が入った
 * だけで境界がずれ、同じカードが重複したり抜けたりする（PR #638 レビュー#2）。
 * `(postedAt, id)` は全順序なので、値で境界を決めればずれない。
 */
export interface UserStyleCursor {
  /** ISO8601。RPC が返した投稿行の posted_at をそのまま運ぶ。 */
  postedAt: string;
  id: string;
}

export interface UserStylePage {
  posts: Post[];
  /**
   * 次ページの cursor。これ以上無ければ null。
   *
   * `usage` 並びは**常に null**（1ページで返し切る設計のため）。
   */
  nextCursor: UserStyleCursor | null;
}

/** 作者チップ1件。 */
export interface UserStyleAuthor {
  authorId: string;
  nickname: string | null;
  avatarUrl: string | null;
  /** その作者の最新の掲載対象投稿。チップの並び順に使う。 */
  latestPostedAt: string;
}
