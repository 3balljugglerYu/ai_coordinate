/**
 * 「キャンペーン対象の投稿」のページ分け(2026-10-15 ユーザー決定・2026-10-24 変更)。
 *
 * - 1ページ6件、1ページに同じ人は1件まで
 * - ページが変われば、前のページに出た人がまた出てよい
 * - 渡された順(新しい順)を崩さない
 * - 2026-10-24: ちがう人だけでは6件にならないページは、1人2件まで→3件まで…と広げて残りを詰める
 *   (同じ人の作品が多いと、1件だけのページが続いていた)。ページの中は新しい順
 */
import { paginatePreferringDistinctAuthors } from "@/features/campaigns/hashtag-campaign/paginate";

type Item = { id: string; authorId: string };

/** "A1" → { id: "A1", authorId: "A" } */
function items(...ids: string[]): Item[] {
  return ids.map((id) => ({ id, authorId: id.replace(/\d+$/, "") }));
}

function ids(pages: Item[][]): string[][] {
  return pages.map((page) => page.map((item) => item.id));
}

describe("paginatePreferringDistinctAuthors", () => {
  test("ちがう人ばかりなら、新しい順に6件ずつ区切る", () => {
    const list = items("A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1", "I1", "J1", "K1", "L1", "M1", "N1");
    expect(ids(paginatePreferringDistinctAuthors(list, 6))).toEqual([
      ["A1", "B1", "C1", "D1", "E1", "F1"],
      ["G1", "H1", "I1", "J1", "K1", "L1"],
      ["M1", "N1"],
    ]);
  });

  test("同じ人の2件目は次のページへ回し、空いた場所には後ろの人を詰める(順番は保つ)", () => {
    const list = items("A1", "A2", "B1", "C1", "D1", "E1", "F1", "G1", "B2");
    expect(ids(paginatePreferringDistinctAuthors(list, 6))).toEqual([
      ["A1", "B1", "C1", "D1", "E1", "F1"],
      ["A2", "G1", "B2"],
    ]);
  });

  test("1ページ目に出た人も、次のページにはまた出てよい", () => {
    const list = items("A1", "B1", "C1", "D1", "E1", "F1", "A2", "B2");
    const pages = paginatePreferringDistinctAuthors(list, 6);
    expect(ids(pages)).toEqual([["A1", "B1", "C1", "D1", "E1", "F1"], ["A2", "B2"]]);
  });

  test("ちがう人で埋まらないページは残りを詰め、ページの中は新しい順に並べる", () => {
    const list = items("A1", "A2", "B1", "C1", "A3", "D1", "E1", "F1", "G1");
    expect(ids(paginatePreferringDistinctAuthors(list, 6))).toEqual([
      ["A1", "B1", "C1", "D1", "E1", "F1"],
      ["A2", "A3", "G1"],
    ]);
  });

  test("詰めるときは1人に偏らせない(1人2件まで→3件まで…の順に広げる)", () => {
    // 順番どおりに詰めると A1・B1・C1・A2・A3・A4 になり、B2 が次のページへ回ってしまう形
    const list = items("A1", "B1", "C1", "A2", "A3", "A4", "A5", "B2");
    expect(ids(paginatePreferringDistinctAuthors(list, 6))).toEqual([
      ["A1", "B1", "C1", "A2", "A3", "B2"],
      ["A4", "A5"],
    ]);
  });

  test("同じ人の作品が多くても、1件だけのページが続かない(2026-10-24 企画ページで14〜20ページ目が1件ずつだった)", () => {
    // ちがう人7人のあとに、Aさんの作品が11件残る形
    const list = items(
      "A1", "B1", "C1", "D1", "E1", "F1",
      "A2", "G1", "A3", "A4", "A5", "A6",
      "A7", "A8", "A9", "A10", "A11", "A12", "A13",
    );
    const pages = paginatePreferringDistinctAuthors(list, 6);
    expect(ids(pages)).toEqual([
      ["A1", "B1", "C1", "D1", "E1", "F1"],
      ["A2", "G1", "A3", "A4", "A5", "A6"],
      ["A7", "A8", "A9", "A10", "A11", "A12"],
      ["A13"],
    ]);
  });

  test("ちがう人で6件になるページには、同じ人は1件まで", () => {
    // 15人がそれぞれ2件ずつ、新しい順に交互に並ぶ
    const authors = "ABCDEFGHIJKLMNO".split("");
    const list: Item[] = [1, 2].flatMap((n) => authors.map((a) => ({ id: `${a}${n}`, authorId: a })));
    const pages = paginatePreferringDistinctAuthors(list, 6);
    expect(pages).toHaveLength(5);
    for (const page of pages) {
      expect(page).toHaveLength(6);
      expect(new Set(page.map((item) => item.authorId)).size).toBe(6);
    }
  });

  test("どう並んでいても、最後のページのほかは6件ちょうど・取りこぼしも重複もない", () => {
    const authors = ["A", "A", "A", "B", "C", "A", "D", "A", "A", "E"];
    const list: Item[] = Array.from({ length: 47 }, (_, index) => {
      const authorId = authors[(index * 7) % authors.length];
      return { id: `${authorId}${index}`, authorId };
    });
    const pages = paginatePreferringDistinctAuthors(list, 6);
    expect(pages).toHaveLength(Math.ceil(list.length / 6));
    expect(pages.slice(0, -1).every((page) => page.length === 6)).toBe(true);
    expect(pages.flat().map((item) => item.id).sort()).toEqual(list.map((item) => item.id).sort());

    // どのページにも、そのとき残っている人ができるだけ多く(6人まで)入っている
    const position = new Map(list.map((item, index) => [item.id, index]));
    let remaining = list;
    for (const page of pages) {
      const available = new Set(remaining.map((item) => item.authorId)).size;
      expect(new Set(page.map((item) => item.authorId)).size).toBe(Math.min(6, available));
      // ページの中は新しい順(渡された順)
      const order = page.map((item) => position.get(item.id) ?? -1);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      const used = new Set(page.map((item) => item.id));
      remaining = remaining.filter((item) => !used.has(item.id));
    }
  });

  test("空なら空。件数が0以下・整数でないときも空(無限に回らない)", () => {
    expect(paginatePreferringDistinctAuthors([], 6)).toEqual([]);
    expect(paginatePreferringDistinctAuthors(items("A1"), 0)).toEqual([]);
    expect(paginatePreferringDistinctAuthors(items("A1"), -1)).toEqual([]);
    expect(paginatePreferringDistinctAuthors(items("A1"), 1.5)).toEqual([]);
  });
});
