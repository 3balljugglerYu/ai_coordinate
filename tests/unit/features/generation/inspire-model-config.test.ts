import {
  INSPIRE_ALLOWED_MODELS,
  isInspireAllowedModel,
} from "@/features/generation/lib/model-config";

/**
 * `process.env.NEXT_PUBLIC_GEMINI_GENERATION_ENABLED` を一時的に切り替えて
 * `model-config` を再評価するヘルパー。
 *
 * `GEMINI_GENERATION_ENABLED` は `process.env` をモジュール load 時に 1 回だけ
 * 読むため、env 切替後の挙動を検証するにはモジュール自体を再ロードする必要がある。
 */
function loadConfigWithGemini(
  enabled: boolean
): typeof import("@/features/generation/lib/model-config") {
  const KEY = "NEXT_PUBLIC_GEMINI_GENERATION_ENABLED";
  const original = process.env[KEY];
  process.env[KEY] = enabled ? "true" : "false";
  let mod!: typeof import("@/features/generation/lib/model-config");
  jest.isolateModules(() => {
    // `jest.requireActual` を使うと @typescript-eslint/no-require-imports に引っかからない。
    // isolateModules 内で呼ぶことで env 切替後のモジュールを fresh に load する。
    mod = jest.requireActual<
      typeof import("@/features/generation/lib/model-config")
    >("@/features/generation/lib/model-config");
  });
  if (original === undefined) {
    delete process.env[KEY];
  } else {
    process.env[KEY] = original;
  }
  return mod;
}

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

    test("isInspireAllowedModel: 未知のモデル文字列は false", () => {
      expect(isInspireAllowedModel("unknown-model")).toBe(false);
    });

    test("isInspireAllowedModel: null / undefined / 空文字は false", () => {
      expect(isInspireAllowedModel(null)).toBe(false);
      expect(isInspireAllowedModel(undefined)).toBe(false);
      expect(isInspireAllowedModel("")).toBe(false);
    });
  });

  // kill switch ON: Gemini 系を全部フィルタアウトし OpenAI のみが残る（停止中のリグレッション担保）。
  describe("kill switch ON (Gemini 停止) 時", () => {
    test("INSPIRE_ALLOWED_MODELS は OpenAI のみ", () => {
      const { INSPIRE_ALLOWED_MODELS } = loadConfigWithGemini(false);
      expect(INSPIRE_ALLOWED_MODELS).toEqual(["gpt-image-2-low"]);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI のみ", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(false);
      expect(INSPIRE_PREVIEW_MODELS).toEqual(["gpt-image-2-low"]);
    });

    test("isInspireAllowedModel は OpenAI low のみ true、Gemini 系は false", () => {
      const { isInspireAllowedModel } = loadConfigWithGemini(false);
      expect(isInspireAllowedModel("gpt-image-2-low")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(
        false
      );
      expect(isInspireAllowedModel("gemini-3-pro-image-1k")).toBe(false);
      expect(isInspireAllowedModel("gemini-2.5-flash-image")).toBe(false);
    });
  });

  // kill switch OFF: 本番再開時の状態。Gemini 系も全部入る。
  describe("kill switch OFF (Gemini 有効) 時", () => {
    test("INSPIRE_ALLOWED_MODELS は nanobanana 1 / nanobanana 2 (1024) / nanobanana pro (1K/2K/4K) / OpenAI を含む", () => {
      const { INSPIRE_ALLOWED_MODELS } = loadConfigWithGemini(true);
      expect(INSPIRE_ALLOWED_MODELS).toEqual([
        "gemini-2.5-flash-image",
        "gemini-3.1-flash-image-preview-1024",
        "gemini-3-pro-image-1k",
        "gemini-3-pro-image-2k",
        "gemini-3-pro-image-4k",
        "gpt-image-2-low",
      ]);
    });

    test("INSPIRE_PREVIEW_MODELS は OpenAI low と Gemini preview-512 のみ（運営コスト最小化のため低解像度固定）", () => {
      const { INSPIRE_PREVIEW_MODELS } = loadConfigWithGemini(true);
      expect(INSPIRE_PREVIEW_MODELS).toEqual([
        "gpt-image-2-low",
        "gemini-3.1-flash-image-preview-512",
      ]);
    });

    test("isInspireAllowedModel: 許可リストにある Gemini モデルと OpenAI は true", () => {
      const { isInspireAllowedModel } = loadConfigWithGemini(true);
      expect(isInspireAllowedModel("gemini-2.5-flash-image")).toBe(true);
      expect(isInspireAllowedModel("gemini-3.1-flash-image-preview-1024")).toBe(
        true
      );
      expect(isInspireAllowedModel("gemini-3-pro-image-1k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-2k")).toBe(true);
      expect(isInspireAllowedModel("gemini-3-pro-image-4k")).toBe(true);
      expect(isInspireAllowedModel("gpt-image-2-low")).toBe(true);
    });
  });
});
