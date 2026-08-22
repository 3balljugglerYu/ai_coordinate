/**
 * 画像分割の矩形計算。
 *
 * ここが誤ると、1px の隙間(黒い線)や重複が出た分割画像を保存させてしまう。
 * ブラウザ依存の Canvas 部分ではなく、純粋な計算だけをテストする。
 */

import {
  buildSplitMode,
  computeSplitRects,
  parseSplitMode,
  pieceFileName,
  splitImageFile,
  splitPieceCount,
  SPLIT_COUNTS,
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

describe("computeSplitRects: 横4分割", () => {
  test("縦長画像を上から4等分する(縦4分割の転置)", () => {
    const rects = computeSplitRects(900, 1600, "horizontal4");

    expect(rects).toEqual([
      { x: 0, y: 0, w: 900, h: 400 },
      { x: 0, y: 400, w: 900, h: 400 },
      { x: 0, y: 800, w: 900, h: 400 },
      { x: 0, y: 1200, w: 900, h: 400 },
    ]);
  });

  test("⭐割り切れない高さは最後の1枚が余りを引き受ける(隙間も重複も無い)", () => {
    const rects = computeSplitRects(1080, 1919, "horizontal4");

    // 1919 / 4 = 479.75 → 479, 479, 479, 482
    expect(rects.map((r) => r.h)).toEqual([479, 479, 479, 482]);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].y).toBe(rects[i - 1].y + rects[i - 1].h);
    }
    const last = rects[rects.length - 1];
    expect(last.y + last.h).toBe(1919);
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

describe("computeSplitRects: 2分割・3分割", () => {
  test("縦2分割は左右で等分される", () => {
    const rects = computeSplitRects(1000, 800, "vertical2");

    expect(rects).toEqual([
      { x: 0, y: 0, w: 500, h: 800 },
      { x: 500, y: 0, w: 500, h: 800 },
    ]);
  });

  test("横3分割は上から3等分される", () => {
    const rects = computeSplitRects(900, 1200, "horizontal3");

    expect(rects).toEqual([
      { x: 0, y: 0, w: 900, h: 400 },
      { x: 0, y: 400, w: 900, h: 400 },
      { x: 0, y: 800, w: 900, h: 400 },
    ]);
  });

  test("⭐割り切れないときは最後の1枚が余りを引き受ける(2/3も4と同じ規則)", () => {
    // 1000 / 3 = 333.33 → 333, 333, 334
    const rects = computeSplitRects(1000, 500, "vertical3");

    expect(rects.map((r) => r.w)).toEqual([333, 333, 334]);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].x).toBe(rects[i - 1].x + rects[i - 1].w);
    }
    const last = rects[rects.length - 1];
    expect(last.x + last.w).toBe(1000);
  });

  test("⭐対応する全モードで、隙間も重複もなく元画像を覆う", () => {
    for (const axis of ["vertical", "horizontal"] as const) {
      for (const count of SPLIT_COUNTS) {
        const mode = buildSplitMode(axis, count);
        const rects = computeSplitRects(1919, 1081, mode);

        expect(rects).toHaveLength(count);
        const covered = rects.reduce((sum, r) => sum + r.w * r.h, 0);
        expect(covered).toBe(1919 * 1081);

        for (let i = 1; i < rects.length; i++) {
          const prev = rects[i - 1];
          const cur = rects[i];
          if (axis === "vertical") {
            expect(cur.x).toBe(prev.x + prev.w);
          } else {
            expect(cur.y).toBe(prev.y + prev.h);
          }
        }
      }
    }
  });
});

describe("parseSplitMode / splitPieceCount", () => {
  test("軸と枚数に分解できる", () => {
    expect(parseSplitMode("vertical2")).toEqual({
      axis: "vertical",
      count: 2,
    });
    expect(parseSplitMode("horizontal3")).toEqual({
      axis: "horizontal",
      count: 3,
    });
  });

  test("2×2 は軸を持たないので null", () => {
    expect(parseSplitMode("grid4")).toBeNull();
  });

  test("枚数は 2×2 も含めて数えられる", () => {
    expect(splitPieceCount("vertical2")).toBe(2);
    expect(splitPieceCount("horizontal3")).toBe(3);
    expect(splitPieceCount("grid4")).toBe(4);
  });

  test("⭐未知のモードは黙って別の分割に倒さず失敗させる", () => {
    expect(() =>
      // 型では防いでいるが、実行時に紛れ込んだら気づけるようにする
      computeSplitRects(100, 100, "vertical5" as never),
    ).toThrow(/UNKNOWN_SPLIT_MODE/);
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

/*
  splitImageFile は Canvas を使うため、jsdom には無い createImageBitmap と
  2D コンテキストをモックして**流れ**を検証する(描画結果そのものは
  実ブラウザで検証済み: 1672×941 → 418×941 × 4 が参考画像と一致)。
*/
describe("splitImageFile", () => {
  const drawCalls: unknown[][] = [];

  beforeEach(() => {
    drawCalls.length = 0;
    (globalThis as Record<string, unknown>).createImageBitmap = jest.fn(
      async () => ({
        width: 1672,
        height: 941,
        close: jest.fn(),
      }),
    );
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage: (...args: unknown[]) => drawCalls.push(args),
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    };
  });

  test("⭐EXIF の回転を反映してからビットマップ化する", async () => {
    await splitImageFile(new Blob(["img"]), "vertical4");

    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(
      expect.any(Blob),
      { imageOrientation: "from-image" },
    );
  });

  test("4枚の PNG Blob を 1..4 の連番で返す", async () => {
    const pieces = await splitImageFile(new Blob(["img"]), "vertical4");

    expect(pieces).toHaveLength(4);
    expect(pieces.map((p) => p.index)).toEqual([1, 2, 3, 4]);
    expect(pieces.every((p) => p.blob.type === "image/png")).toBe(true);
    // 参考画像と同じ 1672×941 → 418×941 × 4
    expect(pieces.every((p) => p.width === 418 && p.height === 941)).toBe(true);
    expect(drawCalls).toHaveLength(4);
  });

  test("失敗してもビットマップを解放する(メモリリークさせない)", async () => {
    const close = jest.fn();
    (globalThis.createImageBitmap as jest.Mock).mockResolvedValueOnce({
      width: 100,
      height: 100,
      close,
    });
    HTMLCanvasElement.prototype.getContext = jest.fn(
      () => null,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    await expect(splitImageFile(new Blob(["img"]), "grid4")).rejects.toThrow(
      "CANVAS_UNAVAILABLE",
    );
    expect(close).toHaveBeenCalled();
  });

  test("toBlob が null を返したら失敗として扱う", async () => {
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(null);
    };

    await expect(
      splitImageFile(new Blob(["img"]), "vertical4"),
    ).rejects.toThrow("TO_BLOB_FAILED");
  });
});
