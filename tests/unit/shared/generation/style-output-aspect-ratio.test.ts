/** @jest-environment node */

import {
  EXPLICIT_OUTPUT_ASPECT_RATIOS,
  STYLE_OUTPUT_ASPECT_RATIO_MODES,
  isStyleOutputAspectRatioMode,
  normalizeStyleOutputAspectRatioMode,
  resolveOutputAspectRatio,
  shouldForceSquareStyleOutput,
} from "@/shared/generation/style-output-aspect-ratio";

describe("style-output-aspect-ratio", () => {
  test("明示比率は自動選択(Gemini)の9段階と一致する", () => {
    expect([...EXPLICIT_OUTPUT_ASPECT_RATIOS]).toEqual([
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
    // モード一覧 = source + preset_image + 9比率
    expect(STYLE_OUTPUT_ASPECT_RATIO_MODES.length).toBe(11);
    expect(STYLE_OUTPUT_ASPECT_RATIO_MODES[0]).toBe("source");
    expect(STYLE_OUTPUT_ASPECT_RATIO_MODES[1]).toBe("preset_image");
  });

  describe("preset_image モード(登録画像に合わせる)", () => {
    test("isStyleOutputAspectRatioMode で有効", () => {
      expect(isStyleOutputAspectRatioMode("preset_image")).toBe(true);
    });
    test("normalize でそのまま維持", () => {
      expect(normalizeStyleOutputAspectRatioMode("preset_image")).toBe(
        "preset_image",
      );
    });
    test("preset サムネ寸法から比率を解決する(入力寸法は無視)", () => {
      // 横長サムネ → 横長比率。入力は縦長でも preset 側が優先される。
      expect(
        resolveOutputAspectRatio(
          "preset_image",
          { width: 900, height: 1600 }, // 入力=縦長(無視される)
          { width: 1600, height: 900 }, // サムネ=横長
        ),
      ).toBe("16:9");
    });
    test("preset サムネ寸法が無ければ入力寸法にフォールバック(source同等)", () => {
      const withInput = resolveOutputAspectRatio(
        "preset_image",
        { width: 1600, height: 900 },
        null,
      );
      const asSource = resolveOutputAspectRatio(
        "source",
        { width: 1600, height: 900 },
      );
      expect(withInput).toBe(asSource);
    });
    test("shouldForceSquareStyleOutput は preset_image では false", () => {
      expect(shouldForceSquareStyleOutput("preset_image")).toBe(false);
    });
  });

  describe("isStyleOutputAspectRatioMode", () => {
    test("source と 9比率は true", () => {
      expect(isStyleOutputAspectRatioMode("source")).toBe(true);
      expect(isStyleOutputAspectRatioMode("3:4")).toBe(true);
      expect(isStyleOutputAspectRatioMode("16:9")).toBe(true);
    });
    test("square や未知値は false(明示モードではない)", () => {
      expect(isStyleOutputAspectRatioMode("square")).toBe(false);
      expect(isStyleOutputAspectRatioMode("2:1")).toBe(false);
      expect(isStyleOutputAspectRatioMode(null)).toBe(false);
    });
  });

  describe("normalizeStyleOutputAspectRatioMode", () => {
    test("旧 square は 1:1 に正規化する(後方互換)", () => {
      expect(normalizeStyleOutputAspectRatioMode("square")).toBe("1:1");
    });
    test("有効値はそのまま、未知値は source", () => {
      expect(normalizeStyleOutputAspectRatioMode("3:4")).toBe("3:4");
      expect(normalizeStyleOutputAspectRatioMode("source")).toBe("source");
      expect(normalizeStyleOutputAspectRatioMode("xxx")).toBe("source");
      expect(normalizeStyleOutputAspectRatioMode(undefined)).toBe("source");
    });
  });

  describe("resolveOutputAspectRatio", () => {
    test("source は入力寸法を最近傍にスナップ(自動選択)", () => {
      // 横長入力 → 16:9 付近
      expect(resolveOutputAspectRatio("source", { width: 1920, height: 1080 })).toBe(
        "16:9",
      );
      // 縦長入力 → 3:4 付近
      expect(resolveOutputAspectRatio("source", { width: 900, height: 1200 })).toBe(
        "3:4",
      );
      // 寸法不明 → 1:1 フォールバック
      expect(resolveOutputAspectRatio("source", null)).toBe("1:1");
    });

    test("明示比率は入力寸法に関係なくその比率を返す", () => {
      expect(resolveOutputAspectRatio("9:16", { width: 1920, height: 1080 })).toBe(
        "9:16",
      );
      expect(resolveOutputAspectRatio("1:1", { width: 1920, height: 1080 })).toBe(
        "1:1",
      );
    });

    test("旧 square は 1:1 として解決する", () => {
      expect(resolveOutputAspectRatio("square", { width: 1920, height: 1080 })).toBe(
        "1:1",
      );
    });
  });

  describe("shouldForceSquareStyleOutput", () => {
    test("1:1 と旧 square のみ true、他は false", () => {
      expect(shouldForceSquareStyleOutput("1:1")).toBe(true);
      expect(shouldForceSquareStyleOutput("square")).toBe(true);
      expect(shouldForceSquareStyleOutput("source")).toBe(false);
      expect(shouldForceSquareStyleOutput("3:4")).toBe(false);
    });
  });
});
