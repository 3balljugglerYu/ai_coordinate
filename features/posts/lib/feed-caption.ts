/**
 * フィード表示のキャプション整形。
 *
 * X に合わせる。投稿本文には装飾目的で空行が大量に入っていることがあり、
 * そのまま出すと1件で画面が埋まってスクロールが機能しなくなる。X は連続した
 * 改行を詰めて表示するので、同じ挙動にする(投稿の保存値は変えない。表示だけ)。
 */

/** フィードで折りたたむ行数。X と同じく5行。 */
export const FEED_CAPTION_MAX_LINES = 5;

/**
 * 表示用にキャプションを整える。
 *
 * - 改行コードを \n に統一する
 * - 行末の空白を落とす(空白だけの行を空行として扱うため)
 * - 3つ以上の連続改行は「空行1つ」まで詰める
 * - 前後の空白・改行を落とす
 */
export function normalizeFeedCaption(caption: string | null | undefined): string {
  if (!caption) {
    return "";
  }
  return caption
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
