import {
  isModelAvailableForGeneration,
} from "@/features/generation/lib/model-config";
import { loadConfigWithGemini } from "@/tests/helpers/load-config-with-gemini";

describe("Inspire model config", () => {
  // 設計方針: Inspire は coordinate / style と同じモデル可否判定を共有する。
  // 解像度ベースの whitelist は廃止し、kill switch（Gemini 停止）のみが効く。

  describe("kill switch 状態に依存しない性質", () => {
    test("未知のモデル文字列は false", () => {
      expect(isModelAvailableForGeneration("unknown-model")).toBe(false);
    });

    test("null / undefined / 空文字は false", () => {
      expect(isModelAvailableForGeneration(null)).toBe(false);
      expect(isModelAvailableForGeneration(undefined)).toBe(false);
      expect(isModelAvailableForGeneration("")).toBe(false);
    });
  });

  describe("kill switch ON (Gemini 停止) 時", () => {
    test("OpenAI 拡張 SKU は全て許可、Gemini 系は全部 false", () => {
      const { isModelAvailableForGeneration } = loadConfigWithGemini(false);

      expect(isModelAvailableForGeneration("gpt-image-2-low-1k")).toBe(true);
      expect(isModelAvailableForGeneration("gpt-image-2-low-4k")).toBe(true);
      expect(isModelAvailableForGeneration("gpt-image-2-medium-4k")).toBe(true);
      expect(isModelAvailableForGeneration("gpt-image-2-high-4k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")).toBe(false);
      expect(isModelAvailableForGeneration("gemini-3.1-flash-image-preview-1024")).toBe(false);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-1k")).toBe(false);
      expect(isModelAvailableForGeneration("gemini-2.5-flash-image")).toBe(false);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI low-1k のみ", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(false);
      expect(INSPIRE_PREVIEW_MODELS).toEqual(["gpt-image-2-low-1k"]);
    });
  });

  describe("kill switch OFF (Gemini 有効) 時", () => {
    test("coordinate / style と同じく Gemini 全種 + OpenAI 拡張 SKU が許可される", () => {
      const { isModelAvailableForGeneration } = loadConfigWithGemini(true);

      expect(isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3.1-flash-image-preview-1024")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-2.5-flash-image")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-1k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-2k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-4k")).toBe(true);
      expect(isModelAvailableForGeneration("gpt-image-2-low-1k")).toBe(true);
      expect(isModelAvailableForGeneration("gpt-image-2-medium-2k")).toBe(true);
      expect(isModelAvailableForGeneration("gpt-image-2-high-4k")).toBe(true);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI low-1k と Gemini preview-512 のみ", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(true);
      expect(INSPIRE_PREVIEW_MODELS).toEqual([
        "gpt-image-2-low-1k",
        "gemini-3.1-flash-image-preview-512",
      ]);
    });
  });
});
