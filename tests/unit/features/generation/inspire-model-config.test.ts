import {
  INSPIRE_ALLOWED_MODELS,
  INSPIRE_PREVIEW_MODELS,
  isInspireAllowedModel,
} from "@/features/generation/lib/model-config";

describe("Inspire model config", () => {
  describe("INSPIRE_ALLOWED_MODELS", () => {
    test("低解像度の gemini-3.1-flash-image-preview-512 を含まない", () => {
      expect(
        (INSPIRE_ALLOWED_MODELS as ReadonlyArray<string>).includes(
          "gemini-3.1-flash-image-preview-512"
        )
      ).toBe(false);
    });

    test("Gemini 停止中は OpenAI のみを含む", () => {
      expect(INSPIRE_ALLOWED_MODELS).toEqual(["gpt-image-2-low"]);
    });
  });

  describe("INSPIRE_PREVIEW_MODELS", () => {
    test("Gemini 停止中は OpenAI low のみ", () => {
      expect(INSPIRE_PREVIEW_MODELS).toEqual(["gpt-image-2-low"]);
    });
  });

  describe("isInspireAllowedModel", () => {
    test("許可リスト内のモデルで true を返す", () => {
      expect(isInspireAllowedModel("gpt-image-2-low")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(
        false
      );
    });

    test("低解像度プレビュー専用モデルは inspire 利用者には不許可", () => {
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-512")).toBe(
        false
      );
    });

    test("未知のモデル文字列は false", () => {
      expect(isInspireAllowedModel("unknown-model")).toBe(false);
    });

    test("null / undefined / 空文字は false", () => {
      expect(isInspireAllowedModel(null)).toBe(false);
      expect(isInspireAllowedModel(undefined)).toBe(false);
      expect(isInspireAllowedModel("")).toBe(false);
    });
  });
});
