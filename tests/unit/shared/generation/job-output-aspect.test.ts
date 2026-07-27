/** @jest-environment node */

import {
  resolveJobOutputAspectRatio,
  resolveOpenAIOutputTargetSize,
} from "@/shared/generation/job-output-aspect";

const PORTRAIT = { width: 800, height: 1200 }; // 2:3
const LANDSCAPE = { width: 1920, height: 1080 }; // 16:9
const SQUARE = { width: 1024, height: 1024 }; // 1:1

describe("resolveJobOutputAspectRatio", () => {
  describe("free", () => {
    test("明示比率は label=その比率、OpenAI targetSize を上書きする", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "free",
        generationMetadata: { outputAspectRatioMode: "3:4" },
        inputDimensions: LANDSCAPE, // 明示比率が入力より優先される
      });
      expect(r.label).toBe("3:4");
      expect(r.shouldOverrideOpenAITargetSize).toBe(true);
    });

    test("入力寸法が無くても明示比率はそのまま使える", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "free",
        generationMetadata: { outputAspectRatioMode: "16:9" },
        inputDimensions: null,
      });
      expect(r.label).toBe("16:9");
      expect(r.shouldOverrideOpenAITargetSize).toBe(true);
    });

    test("source は入力比率にスナップし、OpenAI は従来挙動(上書きしない)", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "free",
        generationMetadata: { outputAspectRatioMode: "source" },
        inputDimensions: PORTRAIT,
      });
      expect(r.label).toBe("2:3");
      expect(r.shouldOverrideOpenAITargetSize).toBe(false);
    });

    test("metadata なしは source 扱い(入力比率・上書きしない)", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "free",
        generationMetadata: null,
        inputDimensions: LANDSCAPE,
      });
      expect(r.label).toBe("16:9");
      expect(r.shouldOverrideOpenAITargetSize).toBe(false);
    });

    test("破損/許容外の値(preset_image・不正値)は source にフォールバック", () => {
      for (const broken of ["preset_image", "square-ish", "", null, 123]) {
        const r = resolveJobOutputAspectRatio({
          generationType: "free",
          generationMetadata: { outputAspectRatioMode: broken },
          inputDimensions: SQUARE,
        });
        expect(r.label).toBe("1:1");
        expect(r.shouldOverrideOpenAITargetSize).toBe(false);
      }
    });

    test("旧 'square' は Free では許容外。1:1 に固定せず source として入力比率に従う", () => {
      // preset_categories 由来の旧互換値。Free の allowlist 外なので API は 400 にする。
      // localStorage/Worker 側も 1:1 へ丸めず source と同じ扱いにして境界の意味を揃える。
      const r = resolveJobOutputAspectRatio({
        generationType: "free",
        generationMetadata: { outputAspectRatioMode: "square" },
        inputDimensions: PORTRAIT, // 非正方形の入力で「1:1 に化けない」ことを検証
      });
      expect(r.label).toBe("2:3");
      expect(r.shouldOverrideOpenAITargetSize).toBe(false);
    });
  });

  describe("one_tap_style", () => {
    test("明示比率は上書きする", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "one_tap_style",
        oneTapStyleMetadata: { outputAspectRatioMode: "9:16" },
        inputDimensions: LANDSCAPE,
      });
      expect(r.label).toBe("9:16");
      expect(r.shouldOverrideOpenAITargetSize).toBe(true);
    });

    test("source は入力比率・上書きしない", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "one_tap_style",
        oneTapStyleMetadata: { outputAspectRatioMode: "source" },
        inputDimensions: PORTRAIT,
      });
      expect(r.label).toBe("2:3");
      expect(r.shouldOverrideOpenAITargetSize).toBe(false);
    });

    test("preset_image はサムネ寸法比率・上書きする", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "one_tap_style",
        oneTapStyleMetadata: {
          outputAspectRatioMode: "preset_image",
          thumbnailWidth: 1080,
          thumbnailHeight: 1920, // 9:16
        },
        inputDimensions: SQUARE,
      });
      expect(r.label).toBe("9:16");
      expect(r.shouldOverrideOpenAITargetSize).toBe(true);
    });

    test("preset_image でサムネ寸法が無ければ入力比率・上書きしない", () => {
      const r = resolveJobOutputAspectRatio({
        generationType: "one_tap_style",
        oneTapStyleMetadata: { outputAspectRatioMode: "preset_image" },
        inputDimensions: LANDSCAPE,
      });
      expect(r.label).toBe("16:9");
      expect(r.shouldOverrideOpenAITargetSize).toBe(false);
    });
  });

  describe("resolveOpenAIOutputTargetSize (provider request 境界)", () => {
    test("free + source は undefined を返し、入力画像ベースの従来挙動へ委ねる", () => {
      expect(
        resolveOpenAIOutputTargetSize({
          generationType: "free",
          generationMetadata: { outputAspectRatioMode: "source" },
          inputDimensions: PORTRAIT,
          sizeTier: "1k",
        }),
      ).toBeUndefined();
    });

    test("free + 明示比率は具体サイズを返す(16の倍数・縦横の向きが一致)", () => {
      const size = resolveOpenAIOutputTargetSize({
        generationType: "free",
        generationMetadata: { outputAspectRatioMode: "3:4" },
        inputDimensions: LANDSCAPE,
        sizeTier: "1k",
      });
      expect(size).toBeDefined();
      const [w, h] = size!.split("x").map(Number);
      // 16px 丸めのため厳密な 3:4 ではないが、縦長であり誤差は許容範囲内。
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
      expect(w).toBeLessThan(h);
      expect(Math.abs(w / h - 3 / 4)).toBeLessThan(0.02);
    });

    test("one_tap_style の明示比率も具体サイズを返す(非回帰)", () => {
      expect(
        resolveOpenAIOutputTargetSize({
          generationType: "one_tap_style",
          oneTapStyleMetadata: { outputAspectRatioMode: "16:9" },
          inputDimensions: PORTRAIT,
          sizeTier: "1k",
        }),
      ).toBeDefined();
    });

    test("coordinate は比率キーがあっても undefined(従来挙動を維持)", () => {
      expect(
        resolveOpenAIOutputTargetSize({
          generationType: "coordinate",
          generationMetadata: { outputAspectRatioMode: "3:4" },
          inputDimensions: PORTRAIT,
          sizeTier: "1k",
        }),
      ).toBeUndefined();
    });
  });

  describe("その他(coordinate / inspire)は従来どおり入力比率・上書きしない", () => {
    test.each(["coordinate", "inspire", "chibi", "unknown"])(
      "%s は generation_metadata の比率キーを無視する",
      (generationType) => {
        const r = resolveJobOutputAspectRatio({
          generationType,
          // 将来 coordinate 等が同名キーを持っても影響させない。
          generationMetadata: { outputAspectRatioMode: "9:16" },
          inputDimensions: PORTRAIT,
        });
        expect(r.label).toBe("2:3");
        expect(r.shouldOverrideOpenAITargetSize).toBe(false);
      },
    );
  });
});
