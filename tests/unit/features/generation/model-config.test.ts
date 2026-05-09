import {
  getPercoinCost,
  GUEST_ALLOWED_MODELS,
  isCanonicalGuestAllowedModel,
  isModelAvailableForGeneration,
  parseGuestRequestedModel,
  resolveEffectiveModelForAuthState,
} from "@/features/generation/lib/model-config";
import {
  isOpenAIImageModel,
  normalizeModelName,
} from "@/features/generation/types";

describe("model-config / model identification helpers", () => {
  describe("getPercoinCost", () => {
    it("returns 10 for gpt-image-2-low", () => {
      expect(getPercoinCost("gpt-image-2-low")).toBe(10);
    });

    it("keeps existing Gemini cost mapping intact", () => {
      expect(getPercoinCost("gemini-3.1-flash-image-preview-512")).toBe(10);
      expect(getPercoinCost("gemini-3-pro-image-2k")).toBe(80);
    });
  });

  describe("normalizeModelName", () => {
    it("passes gpt-image-2-low through unchanged", () => {
      expect(normalizeModelName("gpt-image-2-low")).toBe("gpt-image-2-low");
    });

    it("still normalizes legacy Gemini ids", () => {
      expect(normalizeModelName("gemini-3-pro-image-preview")).toBe(
        "gemini-3-pro-image-2k",
      );
    });
  });

  describe("isOpenAIImageModel", () => {
    it("recognizes OpenAI gpt-image-* models", () => {
      expect(isOpenAIImageModel("gpt-image-2-low")).toBe(true);
    });

    it("returns false for Gemini models", () => {
      expect(isOpenAIImageModel("gemini-3-pro-image-2k")).toBe(false);
      expect(isOpenAIImageModel("gemini-3.1-flash-image-preview-512")).toBe(
        false,
      );
    });

    it("returns false for null / undefined / empty", () => {
      expect(isOpenAIImageModel(null)).toBe(false);
      expect(isOpenAIImageModel(undefined)).toBe(false);
      expect(isOpenAIImageModel("")).toBe(false);
    });
  });

  describe("GUEST_ALLOWED_MODELS / isCanonicalGuestAllowedModel", () => {
    it("Gemini 停止中は ChatGPT Image 2.0 のみ", () => {
      expect(GUEST_ALLOWED_MODELS).toEqual(["gpt-image-2-low"]);
    });

    it("canonical な許可モデルだけ true", () => {
      expect(isCanonicalGuestAllowedModel("gpt-image-2-low")).toBe(true);
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-512")
      ).toBe(false);
    });

    it("canonical でない許可外モデル / エイリアス / 未知 / null は false", () => {
      // エイリアス（normalize 前）
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview")
      ).toBe(false);
      expect(isCanonicalGuestAllowedModel("gemini-2.5-flash-image")).toBe(false);
      // 許可外モデル
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-1024")
      ).toBe(false);
      expect(isCanonicalGuestAllowedModel("gemini-3-pro-image-1k")).toBe(false);
      // 未知 / null
      expect(isCanonicalGuestAllowedModel("dall-e-3")).toBe(false);
      expect(isCanonicalGuestAllowedModel(null)).toBe(false);
      expect(isCanonicalGuestAllowedModel(undefined)).toBe(false);
    });
  });

  describe("parseGuestRequestedModel", () => {
    it("canonical な許可モデルはそのまま返す", () => {
      expect(parseGuestRequestedModel("gpt-image-2-low")).toBe("gpt-image-2-low");
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-512")
      ).toBeNull();
    });

    it("Gemini 停止中は許可モデルへ正規化されるエイリアスも null", () => {
      // gemini-3.1-flash-image-preview → gemini-3.1-flash-image-preview-512
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview")
      ).toBeNull();
      // gemini-2.5-flash-image → gemini-3.1-flash-image-preview-512
      expect(parseGuestRequestedModel("gemini-2.5-flash-image")).toBeNull();
      expect(parseGuestRequestedModel("gemini-2.5-flash-image-preview")).toBeNull();
    });

    it("許可外モデルは null", () => {
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-1024")
      ).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-1k")).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-2k")).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-4k")).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-preview")).toBeNull();
    });

    it("未知の値や null は null（normalize の fallback で許可されない）", () => {
      expect(parseGuestRequestedModel("dall-e-3")).toBeNull();
      expect(parseGuestRequestedModel("")).toBeNull();
      expect(parseGuestRequestedModel(null)).toBeNull();
      expect(parseGuestRequestedModel(undefined)).toBeNull();
    });
  });

  describe("resolveEffectiveModelForAuthState", () => {
    it("ゲストの許可外モデルと停止中 Gemini は DEFAULT_GENERATION_MODEL に丸める", () => {
      expect(
        resolveEffectiveModelForAuthState("gemini-3-pro-image-4k", "guest")
      ).toBe("gpt-image-2-low");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-512",
          "guest"
        )
      ).toBe("gpt-image-2-low");
    });

    it("利用可能モデルはそのまま返し、認証ユーザーの停止中 Gemini は丸める", () => {
      expect(
        resolveEffectiveModelForAuthState(
          "gpt-image-2-low",
          "guest"
        )
      ).toBe("gpt-image-2-low");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3-pro-image-4k",
          "authenticated"
        )
      ).toBe("gpt-image-2-low");
    });
  });

  describe("isModelAvailableForGeneration", () => {
    it("Gemini 停止中は OpenAI のみ利用可能", () => {
      expect(isModelAvailableForGeneration("gpt-image-2-low")).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")
      ).toBe(false);
      expect(isModelAvailableForGeneration("unknown-model")).toBe(false);
    });
  });
});
