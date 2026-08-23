/**
 * 分割位置(使う範囲 + 仕切り)の計算。
 *
 * ここが誤ると、**保存した画像が意図と違う場所で切れる**。しかも画面上は
 * それらしく見えてしまうので、境界の不変条件をここで固定する。
 *
 * - 隣を押しのけない(端まで引いたときに他が潰れて戻せなくならない)
 * - 昇順が崩れない
 * - 枚数を変えても、詰めた端は保つ
 */

import {
  MIN_SEGMENT_RATIO,
  createEqualBoundaries,
  isEqualBoundaries,
  moveBoundary,
  redistributeDividers,
  resetBoundaries,
  toBoundaryList,
} from "@/features/tools/lib/split-boundaries";
import { computeSplitRects } from "@/features/tools/lib/split-image";

describe("createEqualBoundaries", () => {
  test("全体を使って等分する", () => {
    expect(toBoundaryList(createEqualBoundaries(4))).toEqual([
      0, 0.25, 0.5, 0.75, 1,
    ]);
    expect(toBoundaryList(createEqualBoundaries(2))).toEqual([0, 0.5, 1]);
  });

  test("仕切りの数は 枚数-1", () => {
    expect(createEqualBoundaries(3).dividers).toHaveLength(2);
  });
});

describe("moveBoundary: 内側の仕切り", () => {
  test("指定した位置へ動く", () => {
    const moved = moveBoundary(createEqualBoundaries(2), 1, 0.3);
    expect(moved.dividers).toEqual([0.3]);
    // 端は動かない
    expect(moved.start).toBe(0);
    expect(moved.end).toBe(1);
  });

  test("⭐隣を押しのけない(最小間隔で止まる)", () => {
    const base = createEqualBoundaries(4); // 0, .25, .5, .75, 1
    // 2本目(.5)を1本目(.25)より左へ引く
    const moved = moveBoundary(base, 2, 0.1);

    expect(moved.dividers[1]).toBeCloseTo(0.25 + MIN_SEGMENT_RATIO, 5);
    // 押しのけられていない
    expect(moved.dividers[0]).toBe(0.25);
  });

  test("⭐昇順は常に保たれる", () => {
    let b = createEqualBoundaries(4);
    for (const [i, v] of [
      [1, 0.9],
      [3, 0.05],
      [2, 0.99],
    ] as const) {
      b = moveBoundary(b, i, v);
      const list = toBoundaryList(b);
      for (let k = 1; k < list.length; k++) {
        expect(list[k]).toBeGreaterThan(list[k - 1]);
      }
    }
  });
});

describe("moveBoundary: 端(トリミング)", () => {
  test("開始端を右へ動かすと左が捨てられる", () => {
    const moved = moveBoundary(createEqualBoundaries(2), 0, 0.2);
    expect(moved.start).toBeCloseTo(0.2, 5);
    // 0.2〜1 の真ん中 = 0.6（仕切りも付いてくる）
    expect(moved.dividers[0]).toBeCloseTo(0.6, 5);
  });

  test("終了端を左へ動かすと右が捨てられる", () => {
    const b = createEqualBoundaries(2);
    const moved = moveBoundary(b, toBoundaryList(b).length - 1, 0.8);
    expect(moved.end).toBeCloseTo(0.8, 5);
  });

  test("端は画像の外へは出ない", () => {
    const b = createEqualBoundaries(2);
    expect(moveBoundary(b, 0, -0.5).start).toBe(0);
    expect(moveBoundary(b, 2, 1.5).end).toBe(1);
  });

  /**
   * ⭐ 端は「構図を決める枠」。動かすと仕切りも比率ごと付いてくる。
   *
   * 仕切りが残る作りだと、端を詰めても**切れ目の位置が変わらない**ので
   * 「端を詰めて切れ目をキャラクターから外す」ができない。
   * 実際に触ったところ断片が 80/200/200/40 のように歪んで気づいた。
   */
  test("⭐端を動かすと、仕切りも比率を保って一緒に動く", () => {
    const b = createEqualBoundaries(4); // 0, .25, .5, .75, 1

    const moved = moveBoundary(b, 4, 0.8); // 右端を 0.8 へ

    expect(moved.end).toBeCloseTo(0.8, 5);
    // 0〜0.8 を4等分 → 0.2, 0.4, 0.6（等分は等分のまま）
    expect(moved.dividers[0]).toBeCloseTo(0.2, 5);
    expect(moved.dividers[1]).toBeCloseTo(0.4, 5);
    expect(moved.dividers[2]).toBeCloseTo(0.6, 5);
  });

  test("⭐寄せてあった仕切りは、その寄せ具合を保つ", () => {
    // 範囲 0〜1 で 0.1 に寄せた仕切り(相対 10%)
    const b = { start: 0, end: 1, dividers: [0.1] };

    const moved = moveBoundary(b, 2, 0.5); // 右端を半分に

    // 範囲 0〜0.5 の中で相対 10% → 0.05
    expect(moved.dividers[0]).toBeCloseTo(0.05, 5);
  });

  test("端は範囲を潰さない(枚数ぶんの最小幅で止まる)", () => {
    const b = createEqualBoundaries(4);

    const moved = moveBoundary(b, 0, 0.99);

    // 4枚 × MIN_SEGMENT_RATIO ぶんは残る
    expect(moved.end - moved.start).toBeCloseTo(MIN_SEGMENT_RATIO * 4, 5);
    // 昇順は保たれる
    const list = toBoundaryList(moved);
    for (let i = 1; i < list.length; i++) {
      expect(list[i]).toBeGreaterThan(list[i - 1]);
    }
  });
});

describe("redistributeDividers", () => {
  test("⭐枚数を変えても、詰めた端は保たれる", () => {
    const trimmed = { start: 0.2, end: 0.8, dividers: [0.5] };

    const next = redistributeDividers(trimmed, 3);

    expect(next.start).toBe(0.2);
    expect(next.end).toBe(0.8);
    expect(next.dividers).toHaveLength(2);
    // 範囲 0.2〜0.8 を3等分 → 0.4, 0.6
    expect(next.dividers[0]).toBeCloseTo(0.4, 5);
    expect(next.dividers[1]).toBeCloseTo(0.6, 5);
  });
});

describe("isEqualBoundaries / resetBoundaries", () => {
  test("既定のままなら等分と判定する", () => {
    expect(isEqualBoundaries(createEqualBoundaries(4), 4)).toBe(true);
  });

  test("動かしたら等分ではなくなる", () => {
    const moved = moveBoundary(createEqualBoundaries(4), 1, 0.3);
    expect(isEqualBoundaries(moved, 4)).toBe(false);
  });

  test("ごく小さなズレは等分とみなす(ドラッグの丸め誤差を拾わない)", () => {
    const almost = { start: 0, end: 1, dividers: [0.2500001, 0.5, 0.75] };
    expect(isEqualBoundaries(almost, 4)).toBe(true);
  });

  test("均等に戻すと既定へ戻る", () => {
    expect(toBoundaryList(resetBoundaries(3))).toEqual([0, 1 / 3, 2 / 3, 1]);
  });
});

describe("computeSplitRects と組み合わせたとき", () => {
  test("⭐端を詰めた分はトリミングされる", () => {
    const boundaries = { start: 0.25, end: 0.75, dividers: [0.5] };

    const rects = computeSplitRects(1000, 400, "vertical2", boundaries);

    expect(rects).toEqual([
      { x: 250, y: 0, w: 250, h: 400 },
      { x: 500, y: 0, w: 250, h: 400 },
    ]);
  });

  test("⭐動かしても隣どうしは必ず接する(隙間も重複も出ない)", () => {
    const boundaries = { start: 0.07, end: 0.93, dividers: [0.31, 0.62] };

    const rects = computeSplitRects(1919, 1080, "vertical3", boundaries);

    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBe(rects[i - 1].x + rects[i - 1].w);
    }
    // 指定した範囲をちょうど覆う
    expect(rects[0].x).toBe(Math.round(0.07 * 1919));
    const last = rects[rects.length - 1];
    expect(last.x + last.w).toBe(Math.round(0.93 * 1919));
  });

  test("横分割でも同じように効く", () => {
    const boundaries = { start: 0.1, end: 0.9, dividers: [0.5] };

    const rects = computeSplitRects(400, 1000, "horizontal2", boundaries);

    expect(rects).toEqual([
      { x: 0, y: 100, w: 400, h: 400 },
      { x: 0, y: 500, w: 400, h: 400 },
    ]);
  });

  test("省略時は従来どおり全体を等分する", () => {
    expect(computeSplitRects(1000, 400, "vertical2")).toEqual(
      computeSplitRects(1000, 400, "vertical2", createEqualBoundaries(2)),
    );
  });

  test("極端に詰めても 0px の断片を作らない(canvas が例外になる)", () => {
    const boundaries = {
      start: 0.5,
      end: 0.5 + MIN_SEGMENT_RATIO,
      dividers: [],
    };

    const rects = computeSplitRects(10, 10, "vertical2" as never, {
      ...boundaries,
      dividers: [0.5 + MIN_SEGMENT_RATIO / 2],
    });

    for (const rect of rects) {
      expect(rect.w).toBeGreaterThanOrEqual(1);
      expect(rect.h).toBeGreaterThanOrEqual(1);
    }
  });
});
