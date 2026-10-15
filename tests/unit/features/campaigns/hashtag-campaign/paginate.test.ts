/**
 * 「キャンペーン対象の投稿」のページ分け(2026-10-15 ユーザー決定)。
 *
 * - 1ページ6件、1ページに同じ人は1件まで
 * - ページが変われば、前のページに出た人がまた出てよい
 * - 渡された順(新しい順)を崩さない
 */
import { paginateOnePerAuthor } from "@/features/campaigns/hashtag-campaign/paginate";

type Item = { id: string; authorId: string };

/** "A1" → { id: "A1", authorId: "A" } */
function items(...ids: string[]): Item[] {
  return ids.map((id) => ({ id, authorId: id.replace(/\d+$/, "") }));
}

function ids(pages: Item[][]): string[][] {
  return pages.map((page) => page.map((item) => item.id));
}

describe("paginateOnePerAuthor", () => {
  test("ちがう人ばかりなら、新しい順に6件ずつ区切る", () => {
    const list = items("A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1", "J1", "K1", "L1", "M1", "N1");
    expect(ids(paginateOnePerAuthor(list, 6))).toEqual([
      ["A1", "B1", "C1", "D1", "E1", "F1"],
      ["G1", "H1", "I1", "J1", "K1", "L1"],
      ["M1", "N1"],
    ]);
  });

  test("同じ人の2件目は次のページへ回し、空いた場所には後ろの人を詰める(順番は保つ)", () => {
    const list = items("A1", "A2", "B1", "C1", "A3", "D1", "E1", "F1", "G1");
    expect(ids(paginateOnePerAuthor(list, 6))).toEqual([
      ["A1", "B1", "C1", "D1", "E1", "F1"],
      ["A2", "G1"],
      ["A3"],
    ]);
  });

  test("1ページ目に出た人も、次のページにはまた出てよい", () => {
    const list = items("A1", "B1", "C1", "D1", "E1", "F1", "A2", "B2");
    const pages = paginateOnePerAuthor(list, 6);
    expect(ids(pages)).toEqual([["A1", "B1", "C1", "D1", "E1", "F1"], ["A2", "B2"]]);
  });

  test("どのページにも同じ人は1件まで", () => {
    const authors = ["A", "B", "C"];
    const list: Item[] = Array.from({ length: 30 }, (_, index) => {
      const authorId = authors[index % 7 === 0 ? 0 : index % authors.length];
      return { id: `${authorId}${index}`, authorId };
    });
    const pages = paginateOnePerAuthor(list, 6);
    for (const page of pages) {
      expect(new Set(page.map((item) => item.authorId)).size).toBe(page.length);
    }
    // 取りこぼし・重複なし
    expect(pages.flat().map((item) => item.id).sort()).toEqual(list.map((item) => item.id).sort());
  });

  test("残りが同じ人ばかりだと、後ろのページは6件に満たない(例: Aさん10作品・Bさん1作品)", () => {
    const list = items("A1", "A2", "A3", "A4", "A5", "B1", "A6", "A7", "A8", "A9", "A10");
    const pages = paginateOnePerAuthor(list, 6);
    expect(ids(pages)[0]).toEqual(["A1", "B1"]);
    expect(pages).toHaveLength(10);
    expect(pages.slice(1).every((page) => page.length === 1)).toBe(true);
  });

  test("空なら空。件数が0以下・整数でないときも空(無限に回らない)", () => {
    expect(paginateOnePerAuthor([], 6)).toEqual([]);
    expect(paginateOnePerAuthor(items("A1"), 0)).toEqual([]);
    expect(paginateOnePerAuthor(items("A1"), -1)).toEqual([]);
    expect(paginateOnePerAuthor(items("A1"), 1.5)).toEqual([]);
  });
});
