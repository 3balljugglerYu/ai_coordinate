import {
  INSPIRE_ALLOWED_MODELS,
  isInspireAllowedModel,
} from "@/features/generation/lib/model-config";
import { loadConfigWithGemini } from "@/tests/helpers/load-config-with-gemini";

describe("Inspire model config", () => {
  // kill switch の ON / OFF に関係なく成り立つ構造的性質。
  describe("構造（kill switch 状態に依存しない）", () => {
    test("INSPIRE_ALLOWED_MODELS は低解像度の gemini-3.1-flash-image-preview-512 を含まない", () => {
      // preview-512 は申請プレビュー専用（INSPIRE_PREVIEW_MODELS にのみ載る）。
      // 利用者向け INSPIRE_ALLOWED_MODELS にはどちらの kill 状態でも入れない。
      expect(
        (INSPIRE_ALLOWED_MODELS as ReadonlyArray<string>).includes(
          "gemini-3.1-flash-image-preview-512"
        )
      ).toBe(false);
      const enabled = loadConfigWithGemini(true);
      expect(
        (enabled.INSPIRE_ALLOWED_MODELS as ReadonlyArray<string>).includes(
          "gemini-3.1-flash-image-preview-512"
        )
      ).toBe(false);
    });

    test("isInspireAllowedModel: 低解像度プレビュー専用モデル (preview-512) は inspire 利用者には不許可（両状態）", () => {
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-512")).toBe(
        false
      );
      const enabled = loadConfigWithGemini(true);
      expect(
        enabled.isInspireAllowedModel("gemini-3.1-flash-image-preview-512")
      ).toBe(false);
    });

    test("isInspireAllowedModel: high の 2k / 4k は inspire 許可外（コスト面で当面 high-1k に限定）", () => {
      // BASE_INSPIRE_ALLOWED_MODELS のコメント参照。kill switch によらず常に false。
      expect(isInspireAllowedModel("gpt-image-2-high-2k")).toBe(false);
      expect(isInspireAllowedModel("gpt-image-2-high-4k")).toBe(false);
      const enabled = loadConfigWithGemini(true);
      expect(enabled.isInspireAllowedModel("gpt-image-2-high-2k")).toBe(false);
      expect(enabled.isInspireAllowedModel("gpt-image-2-high-4k")).toBe(false);
    });

    test("isInspireAllowedModel: 未知のモデル文字列は false", () => {
      expect(isInspireAllowedModel("unknown-model")).toBe(false);
    });

    test("isInspireAllowedModel: null / undefined / 空文字は false", () => {
      expect(isInspireAllowedModel(null)).toBe(false);
      expect(isInspireAllowedModel(undefined)).toBe(false);
      expect(isInspireAllowedModel("")).toBe(false);
    });
  });

  // kill switch ON: Gemini 系を全部フィルタアウトし OpenAI 拡張 SKU のみが残る（停止中のリグレッション担保）。
  describe("kill switch ON (Gemini 停止) 時", () => {
    test("INSPIRE_ALLOWED_MODELS は gpt-image-2 の低 / 中 / high-1k のみ", () => {
      const { INSPIRE_ALLOWED_MODELS } = loadConfigWithGemini(false);
      expect(INSPIRE_ALLOWED_MODELS).toEqual([
        "gpt-image-2-low-1k",
        "gpt-image-2-low-2k",
        "gpt-image-2-low-4k",
        "gpt-image-2-medium-1k",
        "gpt-image-2-medium-2k",
        "gpt-image-2-medium-4k",
        "gpt-image-2-high-1k",
      ]);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI low-1k のみ", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(false);
      expect(INSPIRE_PREVIEW_MODELS).toEqual(["gpt-image-2-low-1k"]);
    });

    test("isInspireAllowedModel は gpt-image-2 拡張 SKU のみ true、Gemini 系は false", () => {
      const { isInspireAllowedModel } = loadConfigWithGemini(false);
      expect(isInspireAllowedModel("gpt-image-2-low-1k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-low-4k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-medium-4k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-high-1k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(
        false
      );
      expect(isInspireAllowedModel("gemini-3-pro-image-1k")).toBe(false);
      expect(isInspireAllowedModel("gemini-2.5-flash-image")).toBe(false);
    });
  });

  // kill switch OFF: 本番再開時の状態。Gemini 系も全部入る。
  describe("kill switch OFF (Gemini 有効) 時", () => {
    test("INSPIRE_ALLOWED_MODELS は Gemini 全種 + OpenAI 拡張 SKU を含む", () => {
      const { INSPIRE_ALLOWED_MODELS } = loadConfigWithGemini(true);
      expect(INSPIRE_ALLOWED_MODELS).toEqual([
        "gemini-2.5-flash-image",
        "gemini-3.1-flash-image-preview-1024",
        "gemini-3-pro-image-1k",
        "gemini-3-pro-image-2k",
        "gemini-3-pro-image-4k",
        "gpt-image-2-low-1k",
        "gpt-image-2-low-2k",
        "gpt-image-2-low-4k",
        "gpt-image-2-medium-1k",
        "gpt-image-2-medium-2k",
        "gpt-image-2-medium-4k",
        "gpt-image-2-high-1k",
      ]);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI low-1k と Gemini preview-512 のみ（運営コスト最小化のため低解像度固定）", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(true);
      expect(INSPIRE_PREVIEW_MODELS).toEqual([
        "gpt-image-2-low-1k",
        "gemini-3.1-flash-image-preview-512",
      ]);
    });

    test("isInspireAllowedModel: 許可リストにある Gemini モデルと OpenAI 拡張 SKU は true", () => {
      const { isInspireAllowedModel } = loadConfigWithGemini(true);
      expect(isInspireAllowedModel("gemini-2.5-flash-image")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(
        true
      );
      expect(isInspireAllowedModel("gemini-3-pro-image-1k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-2k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-4k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-low-1k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-medium-2k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-high-1k")).toBe(true);
    });
  });
});
