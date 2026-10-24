/**
 * 「キャンペーン対象の投稿」を、決まった件数ずつのページに分ける(2026-10-15 ユーザー決定・2026-10-24 変更)。
 *
 * - ちがう人の作品で件数がそろうページは、1ページに同じ人は1件まで
 * - ちがう人だけでは件数に満たないページは、1人2件まで→3件まで…と少しずつ広げて残りを詰める
 *   (2026-10-24 ユーザー指示)。同じ人の作品が多いと、ほかの人の作品が出きったあと
 *   1件だけのページが続いていた(企画ページで20ページのうち14〜20ページ目が1件ずつ)。
 *   広げるのを1件ずつにするのは、空きを1人の作品だけで埋めないため
 * - ページが変われば、前のページに出た人がまた出てよい
 * - 渡された順(新しい順)をできるだけ崩さない。ページの中も渡された順に並べ、
 *   ページに入れなかった投稿は順番を保ったまま次のページへ回す
 *
 * そのため、最後のページのほかは必ず件数ちょうどになる。同じ人の作品が同じページに
 * 入るのは、ちがう人の作品が足りなくなったページだけ
 * (例: Aさん10作品・Bさん1作品なら、1ページ目は A1・B1・A2〜A5)。
 */
export function paginatePreferringDistinctAuthors<T extends { authorId: string }>(
  items: readonly T[],
  pageSize: number,
): T[][] {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    return [];
  }

  const pages: T[][] = [];
  let queue = items.map((item, index) => ({ item, index }));
  while (queue.length > 0) {
    const page: typeof queue = [];
    const counts = new Map<string, number>();
    // 1周目は1人1件まで。埋まらなければ上限を1つ上げてもう1周する。
    // 上限より少ない人の作品が残っている限り1件以上入るので、毎周1件以上減って終わる
    for (let cap = 1; page.length < pageSize && queue.length > 0; cap += 1) {
      const rest: typeof queue = [];
      for (const entry of queue) {
        const count = counts.get(entry.item.authorId) ?? 0;
        if (page.length < pageSize && count < cap) {
          page.push(entry);
          counts.set(entry.item.authorId, count + 1);
        } else {
          rest.push(entry);
        }
      }
      queue = rest;
    }
    page.sort((a, b) => a.index - b.index);
    pages.push(page.map((entry) => entry.item));
  }
  return pages;
}
