import {
  DEFAULT_GENERATION_MODEL,
  extractImageSize,
  isKnownModelInput,
  KNOWN_MODEL_INPUTS,
  composeGptImage2Model,
  parseGptImage2Model,
  toApiModelName,
} from "@/features/generation/types";

describe("generation types", () => {
  test("extractImageSize_1K用内部モデルはGemini APIへ1Kを返す", () => {
    expect(extractImageSize("gemini-3.1-flash-image-preview-1024")).toBe("1K");
  });

  test("extractImageSize_0_5K用内部モデルはGemini APIへ512を返す", () => {
    expect(extractImageSize("gemini-3.1-flash-image-preview-512")).toBe("512");
  });

  describe("DEFAULT_GENERATION_MODEL", () => {
    test("既定モデルは ChatGPT Image 2.0 (gpt-image-2-low-1k)", () => {
      expect(DEFAULT_GENERATION_MODEL).toBe("gpt-image-2-low-1k");
    });
  });

  describe("isKnownModelInput", () => {
    test("カノニカル / エイリアスを含む既知の値を true で返す", () => {
      for (const value of KNOWN_MODEL_INPUTS) {
        expect(isKnownModelInput(value)).toBe(true);
      }
    });

    test("未知の値や非文字列は false", () => {
      expect(isKnownModelInput("dall-e-3")).toBe(false);
      expect(isKnownModelInput("")).toBe(false);
      expect(isKnownModelInput(null)).toBe(false);
      expect(isKnownModelInput(undefined)).toBe(false);
      expect(isKnownModelInput(123)).toBe(false);
    });
  });

  describe("GPT Image 2 canonical helpers", () => {
    test("quality と size tier から canonical model を合成する", () => {
      expect(composeGptImage2Model("medium", "2k")).toBe(
        "gpt-image-2-medium-2k"
      );
    });

    test("canonical model と legacy low を分解する", () => {
      expect(parseGptImage2Model("gpt-image-2-high-4k")).toEqual({
        canonical: "gpt-image-2-high-4k",
        quality: "high",
        sizeTier: "4k",
      });
      expect(parseGptImage2Model("gpt-image-2-low")).toEqual({
        canonical: "gpt-image-2-low-1k",
        quality: "low",
        sizeTier: "1k",
      });
      expect(parseGptImage2Model("gemini-3-pro-image-1k")).toBeNull();
    });
  });

  describe("toApiModelName", () => {
    test("Gemini 系のサイズ付き ID を Gemini API 名へ変換", () => {
      expect(toApiModelName("gemini-3.1-flash-image-preview-512")).toBe(
        "gemini-3.1-flash-image-preview"
      );
      expect(toApiModelName("gemini-3.1-flash-image-preview-1024")).toBe(
        "gemini-3.1-flash-image-preview"
      );
      expect(toApiModelName("gemini-3-pro-image-1k")).toBe(
        "gemini-3-pro-image-preview"
      );
      expect(toApiModelName("gemini-3-pro-image-2k")).toBe(
        "gemini-3-pro-image-preview"
      );
      expect(toApiModelName("gemini-3-pro-image-4k")).toBe(
        "gemini-3-pro-image-preview"
      );
    });

    test("OpenAI 系を渡したらランタイム例外", () => {
      expect(() =>
        // 型上は GeminiOnlyModel に絞られているが、unknown 経由の誤投入を防ぐためのガード
        toApiModelName("gpt-image-2-low-1k" as never)
      ).toThrow(/OpenAI image models are not Gemini-routable/);
    });
  });
});
