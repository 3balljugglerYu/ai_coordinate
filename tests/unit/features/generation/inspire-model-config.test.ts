import { isInspireAllowedModel } from "@/features/generation/lib/model-config";
import { loadConfigWithGemini } from "@/tests/helpers/load-config-with-gemini";

describe("Inspire model config", () => {
  // 設計方針: Inspire は coordinate / style と同じモデル可否判定を共有する。
  // 解像度ベースの whitelist は廃止し、kill switch（Gemini 停止）のみが効く。

  describe("kill switch 状態に依存しない性質", () => {
    test("isInspireAllowedModel: 未知のモデル文字列は false", () => {
      expect(isInspireAllowedModel("unknown-model")).toBe(false);
    });

    test("isInspireAllowedModel: null / undefined / 空文字は false", () => {
      expect(isInspireAllowedModel(null)).toBe(false);
      expect(isInspireAllowedModel(undefined)).toBe(false);
      expect(isInspireAllowedModel("")).toBe(false);
    });
  });

  describe("kill switch ON (Gemini 停止) 時", () => {
    test("OpenAI モデルのみ許可、Gemini 系は全部 false", () => {
      const { isInspireAllowedModel } = loadConfigWithGemini(false);
      expect(isInspireAllowedModel("gpt-image-2-low")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-512")).toBe(false);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(false);
      expect(isInspireAllowedModel("gemini-3-pro-image-1k")).toBe(false);
      expect(isInspireAllowedModel("gemini-2.5-flash-image")).toBe(false);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI のみ", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(false);
      expect(INSPIRE_PREVIEW_MODELS).toEqual(["gpt-image-2-low"]);
    });
  });

  describe("kill switch OFF (Gemini 有効) 時", () => {
    test("coordinate / style と同じく、全 Gemini モデル + OpenAI low が許可される（preview-512 含む）", () => {
      const { isInspireAllowedModel } = loadConfigWithGemini(true);
      // preview-512 も含めて全部 true（whitelist 廃止）
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-512")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(true);
      expect(isInspireAllowedModel("gemini-2.5-flash-image")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-1k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-2k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-4k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-low")).toBe(true);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI low と Gemini preview-512 のみ（プレビュー用は別途運営コスト最小化のため低解像度固定）", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(true);
      expect(INSPIRE_PREVIEW_MODELS).toEqual([
        "gpt-image-2-low",
        "gemini-3.1-flash-image-preview-512",
      ]);
    });
  });
});
