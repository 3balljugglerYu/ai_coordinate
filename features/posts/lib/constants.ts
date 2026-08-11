export const REPLY_PANEL_MOBILE_BREAKPOINT = 768;

/**
 * フィード(1列表示)のカード最大幅。
 *
 * PostList の中央寄せ(`max-w-[600px]`)、PostFeedCard の `sizes`、
 * 無限スクロールの先読み距離の計算がこの値を共有する。
 * Tailwind の任意値クラスはリテラルが要るためクラス側は直書きになる。
 * 変えるときは PostList の `max-w-[600px]` も一緒に直すこと。
 */
export const FEED_CARD_MAX_WIDTH_PX = 600;

/**
 * 利用回数を公開表示しはじめる下限。
 *
 * 「1回利用されました」は社会的証明として働かないどころか、
 * 「誰も使っていない」という逆の証明になってしまう。原作者から見ても
 * 少ない数字を晒されるのは投稿の意欲を削ぐ。届くまでは何も出さない。
 *
 * 10 はマイルストーン通知の節目 (1, 5, 10, 25, …) とも揃えてある。
 */
export const USAGE_COUNT_DISPLAY_THRESHOLD = 10;

/** 利用回数を表示してよいか。 */
export function shouldShowUsageCount(count: number): boolean {
  return count >= USAGE_COUNT_DISPLAY_THRESHOLD;
}
