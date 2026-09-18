/**
 * /user-styles の定数。
 *
 * ⭐ **サーバー・クライアントの両方から読むので、ここには副作用を持ち込まない。**
 * 取得層（`get-user-style-page.ts` / `get-followed-authors.ts`）は `server-only` で、
 * クライアントから import すると落ちる。定数だけを分けておくことで、
 * フィードのクライアント側が1ページの件数を知れる。
 */

/** 1ページの既定件数。ホームのフィード（/api/posts）と揃える。 */
export const USER_STYLE_PAGE_SIZE = 20;

/**
 * 1回で取れる上限。**RPC 側の `p_limit` 制約（1..40）と同じ値にすること。**
 * 超えると RPC が例外を投げる（黙って丸めない設計）。
 */
export const USER_STYLE_PAGE_MAX = 40;

/**
 * チップに出す作者の上限。**RPC 側の `p_limit` 制約（1..50）以下にすること。**
 *
 * チップ列は横スクロールなので多すぎても壊れないが、実データの作者は13人なので
 * 当面これで足りる。フォロー数が多い人でも横に伸びすぎないようにする意味もある。
 */
export const USER_STYLE_AUTHOR_CHIP_LIMIT = 30;
