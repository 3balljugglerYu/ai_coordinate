import {
  DEFAULT_GENERATION_MODEL,
  extractImageSize,
  isKnownModelInput,
  KNOWN_MODEL_INPUTS,
  composeOpenAIImageModel,
  normalizeModelName,
  parseOpenAIImageModel,
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

  describe("OpenAI image canonical helpers (types 経由の再エクスポート)", () => {
    test("family + quality + size tier から canonical model を合成する", () => {
      expect(composeOpenAIImageModel("gpt-image-2", "medium", "2k")).toBe(
        "gpt-image-2-medium-2k"
      );
      expect(
        composeOpenAIImageModel("gpt-image-2.5-flare", "medium", "2k")
      ).toBe("gpt-image-2.5-flare-medium-2k");
    });

    test("canonical model と legacy low を分解する", () => {
      expect(parseOpenAIImageModel("gpt-image-2-high-4k")).toEqual({
        canonical: "gpt-image-2-high-4k",
        family: "gpt-image-2",
        quality: "high",
        sizeTier: "4k",
      });
      expect(parseOpenAIImageModel("gpt-image-2-low")).toEqual({
        canonical: "gpt-image-2-low-1k",
        family: "gpt-image-2",
        quality: "low",
        sizeTier: "1k",
      });
      expect(parseOpenAIImageModel("gemini-3-pro-image-1k")).toBeNull();
    });

    test("KNOWN_MODEL_INPUTS は 2.0 / 2.5 の canonical 18 件と legacy low を含む", () => {
      expect(isKnownModelInput("gpt-image-2-low-1k")).toBe(true);
      expect(isKnownModelInput("gpt-image-2.5-flare-high-4k")).toBe(true);
      expect(isKnownModelInput("gpt-image-2-low")).toBe(true);
      expect(isKnownModelInput("gpt-image-2.5-flare-low")).toBe(false);
      expect(isKnownModelInput("gpt-image-2.5-sunburst-low-1k")).toBe(false);
      expect(
        KNOWN_MODEL_INPUTS.filter((value) => value.startsWith("gpt-image-"))
      ).toHaveLength(19);
    });

    test("normalizeModelName は OpenAI 系を family を問わず canonical のまま返す", () => {
      expect(normalizeModelName("gpt-image-2-low")).toBe("gpt-image-2-low-1k");
      expect(normalizeModelName("gpt-image-2-high-2k")).toBe("gpt-image-2-high-2k");
      expect(normalizeModelName("gpt-image-2.5-flare-low-1k")).toBe(
        "gpt-image-2.5-flare-low-1k"
      );
      // 未知の OpenAI 風文字列は既定モデルへ寄せる(従来どおり)
      expect(normalizeModelName("gpt-image-bogus")).toBe(DEFAULT_GENERATION_MODEL);
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
