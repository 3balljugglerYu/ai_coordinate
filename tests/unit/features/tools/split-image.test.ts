/**
 * 画像分割の矩形計算。
 *
 * ここが誤ると、1px の隙間(黒い線)や重複が出た分割画像を保存させてしまう。
 * ブラウザ依存の Canvas 部分ではなく、純粋な計算だけをテストする。
 */

import {
  computeSplitRects,
  pieceFileName,
} from "@/features/tools/lib/split-image";

describe("computeSplitRects: 縦4分割", () => {
  test("4で割り切れる幅は等分になる", () => {
    const rects = computeSplitRects(1600, 900, "vertical4");

    expect(rects).toEqual([
      { x: 0, y: 0, w: 400, h: 900 },
      { x: 400, y: 0, w: 400, h: 900 },
      { x: 800, y: 0, w: 400, h: 900 },
      { x: 1200, y: 0, w: 400, h: 900 },
    ]);
  });

  /*
    参考画像と同じ 1672×941。1672 / 4 = 418 で割り切れる。
    実際に流行っている形をそのまま固定しておく。
  */
  test("参考画像のサイズ(1672×941)で 418×941 が4枚できる", () => {
    const rects = computeSplitRects(1672, 941, "vertical4");

    expect(rects.every((r) => r.w === 418 && r.h === 941)).toBe(true);
  });

  test("⭐割り切れない幅は最後の1枚が余りを引き受ける(隙間も重複も無い)", () => {
    const rects = computeSplitRects(1919, 1080, "vertical4");

    // 1919 / 4 = 479.75 → 479, 479, 479, 482
    expect(rects.map((r) => r.w)).toEqual([479, 479, 479, 482]);
    // 連続性: 前の右端 = 次の左端
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBe(rects[i - 1].x + rects[i - 1].w);
    }
    // 全体を覆う
    const last = rects[rects.length - 1];
    expect(last.x + last.w).toBe(1919);
  });

  test("縦長の画像でも動く(縦4分割の意味は薄いが壊れない)", () => {
    const rects = computeSplitRects(400, 1600, "vertical4");

    expect(rects.map((r) => r.w)).toEqual([100, 100, 100, 100]);
    expect(rects.every((r) => r.h === 1600)).toBe(true);
  });
});

describe("computeSplitRects: 2×2分割", () => {
  test("⭐並びは 左上 → 右上 → 左下 → 右下(X の 2×2 と同じ)", () => {
    const rects = computeSplitRects(1000, 800, "grid4");

    expect(rects).toEqual([
      { x: 0, y: 0, w: 500, h: 400 },
      { x: 500, y: 0, w: 500, h: 400 },
      { x: 0, y: 400, w: 500, h: 400 },
      { x: 500, y: 400, w: 500, h: 400 },
    ]);
  });

  test("奇数サイズは右列・下段が余りを引き受ける", () => {
    const rects = computeSplitRects(1001, 801, "grid4");

    expect(rects[0]).toEqual({ x: 0, y: 0, w: 500, h: 400 });
    expect(rects[1]).toEqual({ x: 500, y: 0, w: 501, h: 400 });
    expect(rects[2]).toEqual({ x: 0, y: 400, w: 500, h: 401 });
    expect(rects[3]).toEqual({ x: 500, y: 400, w: 501, h: 401 });
  });
});

describe("pieceFileName", () => {
  test("拡張子を外して連番の PNG 名にする", () => {
    expect(pieceFileName("fireworks.jpg", 1)).toBe("fireworks_1.png");
    expect(pieceFileName("photo.PNG", 4)).toBe("photo_4.png");
  });

  test("拡張子が無くても動く", () => {
    expect(pieceFileName("photo", 2)).toBe("photo_2.png");
  });

  test("ドットを含む名前は最後の拡張子だけ外す", () => {
    expect(pieceFileName("my.photo.v2.jpeg", 3)).toBe("my.photo.v2_3.png");
  });

  test("空文字は image にフォールバック", () => {
    expect(pieceFileName("", 1)).toBe("image_1.png");
  });
});
