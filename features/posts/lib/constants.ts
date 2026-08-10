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
