/** @jest-environment node */

import {
  GEMINI_SUPPORTED_ASPECT_RATIOS,
  resolveGeminiAspectRatio,
} from "@/shared/generation/gemini-aspect-ratio";

describe("resolveGeminiAspectRatio", () => {
  describe("典型的なアスペクト比は完全一致するラベルを返す", () => {
    test("1:1 → '1:1'", () => {
      expect(resolveGeminiAspectRatio({ width: 1000, height: 1000 })).toBe(
        "1:1",
      );
    });

    test("9:16 (縦長スマホ写真) → '9:16'", () => {
      expect(resolveGeminiAspectRatio({ width: 900, height: 1600 })).toBe(
        "9:16",
      );
    });

    test("16:9 (横長スマホ写真) → '16:9'", () => {
      expect(resolveGeminiAspectRatio({ width: 1600, height: 900 })).toBe(
        "16:9",
      );
    });

    test("3:4 → '3:4'", () => {
      expect(resolveGeminiAspectRatio({ width: 600, height: 800 })).toBe("3:4");
    });

    test("4:3 → '4:3'", () => {
      expect(resolveGeminiAspectRatio({ width: 800, height: 600 })).toBe("4:3");
    });

    test("2:3 → '2:3'", () => {
      expect(resolveGeminiAspectRatio({ width: 400, height: 600 })).toBe("2:3");
    });

    test("3:2 → '3:2'", () => {
      expect(resolveGeminiAspectRatio({ width: 600, height: 400 })).toBe("3:2");
    });

    test("4:5 → '4:5'", () => {
      expect(resolveGeminiAspectRatio({ width: 400, height: 500 })).toBe("4:5");
    });

    test("5:4 → '5:4'", () => {
      expect(resolveGeminiAspectRatio({ width: 500, height: 400 })).toBe("5:4");
    });
  });

  describe("クランプ動作", () => {
    test("9:16 より縦長 (1:3) は '9:16' にクランプ", () => {
      expect(resolveGeminiAspectRatio({ width: 500, height: 1500 })).toBe(
        "9:16",
      );
    });

    test("16:9 より横長 (3:1) は '16:9' にクランプ", () => {
      expect(resolveGeminiAspectRatio({ width: 1500, height: 500 })).toBe(
        "16:9",
      );
    });

    test("非常に極端な縦長 (1:10) も '9:16' にクランプ", () => {
      expect(resolveGeminiAspectRatio({ width: 100, height: 1000 })).toBe(
        "9:16",
      );
    });
  });

  describe("最近傍ロジック (log 距離)", () => {
    test("0.7 (2:3 と 3:4 の間) は log 距離が短い 2:3 寄り", () => {
      // 2:3 = 0.6667, 3:4 = 0.75。幾何平均 = sqrt(0.6667 * 0.75) ≒ 0.707
      // 入力 0.7 は幾何平均より小さいため 2:3 が選ばれる
      expect(resolveGeminiAspectRatio({ width: 700, height: 1000 })).toBe(
        "2:3",
      );
    });

    test("0.72 (2:3 と 3:4 の境界より上) は '3:4'", () => {
      expect(resolveGeminiAspectRatio({ width: 720, height: 1000 })).toBe(
        "3:4",
      );
    });

    test("1.1 (1:1 と 5:4 の境界) は 1:1 寄り", () => {
      // 1:1 = 1.0, 5:4 = 1.25。幾何平均 = sqrt(1.0 * 1.25) ≒ 1.118
      expect(resolveGeminiAspectRatio({ width: 1100, height: 1000 })).toBe(
        "1:1",
      );
    });
  });

  describe("フォールバック (1:1)", () => {
    test("null は 1:1", () => {
      expect(resolveGeminiAspectRatio(null)).toBe("1:1");
    });

    test("undefined は 1:1", () => {
      expect(resolveGeminiAspectRatio(undefined)).toBe("1:1");
    });

    test("width=0 は 1:1", () => {
      expect(resolveGeminiAspectRatio({ width: 0, height: 100 })).toBe("1:1");
    });

    test("height=0 は 1:1", () => {
      expect(resolveGeminiAspectRatio({ width: 100, height: 0 })).toBe("1:1");
    });

    test("負の値は 1:1", () => {
      expect(resolveGeminiAspectRatio({ width: -100, height: 200 })).toBe(
        "1:1",
      );
    });

    test("NaN は 1:1", () => {
      expect(resolveGeminiAspectRatio({ width: NaN, height: 100 })).toBe("1:1");
    });

    test("Infinity は 1:1", () => {
      expect(
        resolveGeminiAspectRatio({ width: Infinity, height: 100 }),
      ).toBe("1:1");
    });
  });

  describe("サポート対象アスペクト比一覧", () => {
    test("9 段階すべて含まれる", () => {
      expect(GEMINI_SUPPORTED_ASPECT_RATIOS).toHaveLength(9);
      const labels = GEMINI_SUPPORTED_ASPECT_RATIOS.map((e) => e.label);
      expect(labels).toEqual([
        "9:16",
        "4:5",
        "3:4",
        "2:3",
        "1:1",
        "3:2",
        "4:3",
        "5:4",
        "16:9",
      ]);
    });
  });
});
