/**
 * 「キャンペーン対象の投稿」を、決まった件数ずつのページに分ける(2026-10-15 ユーザー決定)。
 *
 * - 1ページに同じ人は1件まで
 * - ページが変われば、前のページに出た人がまた出てよい
 * - 渡された順(新しい順)をできるだけ崩さない。ページに入れなかった投稿は、
 *   順番を保ったまま次のページへ回す
 *
 * そのため、残りが同じ人の作品ばかりになると、後ろのページは件数に満たない
 * (例: Aさん10作品・Bさん1作品なら、1ページ目は2件、2ページ目からはAさんが1件ずつ)。
 */
export function paginateOnePerAuthor<T extends { authorId: string }>(
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
    // 先頭の1件は必ず入るので、毎回1件以上減って終わる
    pages.push(page);
    queue = rest;
  }
  return pages;
}
