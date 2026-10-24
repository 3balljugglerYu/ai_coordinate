/**
 * 「キャンペーン対象の投稿」を、決まった件数ずつのページに分ける(2026-10-15 ユーザー決定・2026-10-24 変更)。
 *
 * - 1ページに同じ人は1件まで
 * - ページが変われば、前のページに出た人がまた出てよい
 * - 渡された順(新しい順)をできるだけ崩さない。ページに入れなかった投稿は、
 *   順番を保ったまま次のページへ回す
 * - ちがう人だけでは件数に満たないページは、残りを新しい順に詰める(2026-10-24 ユーザー指示)。
 *   同じ人の作品が多いと、ほかの人の作品が出きったあと1件だけのページが続いていた
 *   (企画ページで20ページのうち14〜20ページ目が1件ずつ)。
 *
 * そのため、最後のページのほかは必ず件数ちょうどになる。同じ人の作品が並ぶのは、
 * ちがう人の作品が足りなくなったページだけ
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
  let queue: readonly T[] = items;
  while (queue.length > 0) {
    const page: T[] = [];
    const authors = new Set<string>();
    const rest: T[] = [];
    for (const item of queue) {
      if (page.length < pageSize && !authors.has(item.authorId)) {
        page.push(item);
        authors.add(item.authorId);
      } else {
        rest.push(item);
      }
    }
    // ちがう人で埋まらなければ、回した残りから新しい順に詰める
    page.push(...rest.splice(0, pageSize - page.length));
    // 先頭の1件は必ず入るので、毎回1件以上減って終わる
    pages.push(page);
    queue = rest;
  }
  return pages;
}
