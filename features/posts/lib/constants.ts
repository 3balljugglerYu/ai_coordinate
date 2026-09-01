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
 * 3 なのは、実際に 3 人が作っていれば証明として十分に働くのと、
 * これより高くすると free 側(投稿ごとのプロンプト利用)が事実上
 * 常に非表示になるため。10 だった頃は該当が 1 件も無かった。
 */
export const USAGE_COUNT_DISPLAY_MIN = 3;

/**
 * 表示用に丸めた利用回数。下限未満は `null`(＝何も出さない)。
 *
 * 文言が「{count}回以上利用されました」なので、**必ず切り捨てる**。
 * 四捨五入すると 8 回を「10回以上」と言うことになり、表示が嘘になる。
 *
 * 刻みは 50 未満が 5、50 以上が 10。数が増えるほど 1 の位の差は
 * 意味を持たなくなるので、大きい側を粗くして読みやすさを取る。
 * 3〜4 は下限そのものを出したいので単独の段にしている。
 *
 * ⭐ `sourcePromptUsageCount` / `styleUsageCount` に渡す数字は必ずここを
 * 通すこと。文言が「以上」で固定なので、素の回数を渡した箇所だけが嘘になる。
 */
export function usageCountBucket(count: number): number | null {
  if (!Number.isFinite(count) || count < USAGE_COUNT_DISPLAY_MIN) {
    return null;
  }
  if (count < 5) {
    return USAGE_COUNT_DISPLAY_MIN; // 3,4 → 3
  }
  if (count < 50) {
    return Math.floor(count / 5) * 5; // 5〜49 → 5,10,…,45
  }
  return Math.floor(count / 10) * 10; // 50〜 → 50,60,70,…
}
