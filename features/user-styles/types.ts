import type { Post } from "@/features/posts/types";

/** /user-styles の並び。チップの選択がそのままこの値になる。 */
export type UserStyleSort = "newest" | "usage";

/**
 * 次ページの開始位置。並びごとに形が違う。
 *
 * ⭐ **offset ではなく keyset。** offset だと1ページ目の表示中に新規投稿が入った
 * だけで境界がずれ、同じカードが重複したり抜けたりする（PR #638 レビュー#2）。
 *
 * - `newest`: `(postedAt, id)` は全順序なので、値で境界を決めればずれない
 * - `usage`: 毎時確定する順位(`user_style_usage_rankings.position`)。順位が固定されて
 *   いるので、順位で境界を決めればずれない(2026-10-01 にページング化)
 */
export type UserStyleCursor = UserStyleNewestCursor | UserStyleUsageCursor;

export interface UserStyleNewestCursor {
  /** ISO8601。RPC が返した投稿行の posted_at をそのまま運ぶ。 */
  postedAt: string;
  id: string;
}

export interface UserStyleUsageCursor {
  /** 最後に読んだ行の確定順位。次はこれより後ろから読む。 */
  position: number;
}

export interface UserStylePage {
  posts: Post[];
  /**
   * 次ページの cursor。これ以上無ければ null。
   *
   * `usage` 並びは確定順位の cursor。順位が古い(ライブ集計へ倒れた)ときは、
   * 2ページ目以降は空で返る(順序を固定できないので、重複・欠落を出すより止める)。
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
