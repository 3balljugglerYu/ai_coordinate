import { getPercoinCost } from "@/features/generation/lib/model-config";
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
});
