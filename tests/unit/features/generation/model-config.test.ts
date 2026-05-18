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
import { loadConfigWithGemini } from "@/tests/helpers/load-config-with-gemini";

describe("model-config / model identification helpers", () => {
  describe("getPercoinCost", () => {
    it("returns the GPT Image 2 percoin matrix", () => {
      expect(getPercoinCost("gpt-image-2-low-1k")).toBe(10);
      expect(getPercoinCost("gpt-image-2-low-2k")).toBe(20);
      expect(getPercoinCost("gpt-image-2-low-4k")).toBe(40);
      expect(getPercoinCost("gpt-image-2-medium-1k")).toBe(20);
      expect(getPercoinCost("gpt-image-2-medium-2k")).toBe(50);
      expect(getPercoinCost("gpt-image-2-medium-4k")).toBe(80);
      expect(getPercoinCost("gpt-image-2-high-1k")).toBe(50);
      expect(getPercoinCost("gpt-image-2-high-2k")).toBe(80);
      expect(getPercoinCost("gpt-image-2-high-4k")).toBe(130);
    });

    it("keeps existing Gemini cost mapping intact", () => {
      expect(getPercoinCost("gemini-3.1-flash-image-preview-512")).toBe(10);
      expect(getPercoinCost("gemini-3-pro-image-2k")).toBe(80);
    });
  });

  describe("normalizeModelName", () => {
    it("passes gpt-image-2-low-1k through unchanged", () => {
      expect(normalizeModelName("gpt-image-2-low-1k")).toBe("gpt-image-2-low-1k");
    });

    it("normalizes the legacy GPT Image 2 low id to the 1k canonical", () => {
      expect(normalizeModelName("gpt-image-2-low")).toBe("gpt-image-2-low-1k");
    });

    it("still normalizes legacy Gemini ids", () => {
      expect(normalizeModelName("gemini-3-pro-image-preview")).toBe(
        "gemini-3-pro-image-2k",
      );
    });
  });

  describe("isOpenAIImageModel", () => {
    it("recognizes OpenAI gpt-image-* models", () => {
      expect(isOpenAIImageModel("gpt-image-2-low-1k")).toBe(true);
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
      expect(GUEST_ALLOWED_MODELS).toEqual(["gpt-image-2-low-1k"]);
    });

    it("canonical な許可モデルだけ true", () => {
      expect(isCanonicalGuestAllowedModel("gpt-image-2-low-1k")).toBe(true);
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
      expect(parseGuestRequestedModel("gpt-image-2-low-1k")).toBe("gpt-image-2-low-1k");
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-512")
      ).toBeNull();
    });

    it("legacy GPT Image 2 low は canonical に正規化して許可する", () => {
      expect(parseGuestRequestedModel("gpt-image-2-low")).toBe(
        "gpt-image-2-low-1k"
      );
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
      expect(parseGuestRequestedModel("gpt-image-2-low-2k")).toBeNull();
      expect(parseGuestRequestedModel("gpt-image-2-medium-1k")).toBeNull();
      expect(parseGuestRequestedModel("gpt-image-2-high-1k")).toBeNull();
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
      ).toBe("gpt-image-2-low-1k");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-512",
          "guest"
        )
      ).toBe("gpt-image-2-low-1k");
    });

    it("利用可能モデルはそのまま返し、認証ユーザーの停止中 Gemini は丸める", () => {
      expect(
        resolveEffectiveModelForAuthState(
          "gpt-image-2-low-1k",
          "guest"
        )
      ).toBe("gpt-image-2-low-1k");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3-pro-image-4k",
          "authenticated"
        )
      ).toBe("gpt-image-2-low-1k");
    });
  });

  describe("isModelAvailableForGeneration", () => {
    it("Gemini 停止中は OpenAI のみ利用可能", () => {
      expect(isModelAvailableForGeneration("gpt-image-2-low-1k")).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")
      ).toBe(false);
      expect(isModelAvailableForGeneration("unknown-model")).toBe(false);
    });
  });

  // 以下は kill switch を ON にしたときの挙動を回帰テストする。
  // 上の既存ブロックは OFF（停止中）状態の本番デフォルトを担保し、
  // 下のブロックは将来 Gemini を再開した時のリグレッションを担保する。
  describe("kill switch ON (Gemini 有効) 時", () => {
    it("GUEST_ALLOWED_MODELS にはゲスト用 Gemini preview-512 も含まれる", () => {
      const { GUEST_ALLOWED_MODELS } = loadConfigWithGemini(true);
      expect(GUEST_ALLOWED_MODELS).toEqual([
        "gpt-image-2-low-1k",
        "gemini-3.1-flash-image-preview-512",
      ]);
    });

    it("isCanonicalGuestAllowedModel: 許可リストの Gemini も true、許可外 Gemini は false", () => {
      const { isCanonicalGuestAllowedModel } = loadConfigWithGemini(true);
      expect(isCanonicalGuestAllowedModel("gpt-image-2-low-1k")).toBe(true);
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-512")
      ).toBe(true);
      expect(
        isCanonicalGuestAllowedModel("gemini-3.1-flash-image-preview-1024")
      ).toBe(false);
      expect(isCanonicalGuestAllowedModel("gemini-3-pro-image-1k")).toBe(false);
    });

    it("parseGuestRequestedModel: ゲスト許可 Gemini はそのまま返り、許可外は null", () => {
      const { parseGuestRequestedModel } = loadConfigWithGemini(true);
      expect(parseGuestRequestedModel("gpt-image-2-low-1k")).toBe(
        "gpt-image-2-low-1k"
      );
      // 旧 "gpt-image-2-low" は normalize 後 "gpt-image-2-low-1k" に正規化される
      expect(parseGuestRequestedModel("gpt-image-2-low")).toBe(
        "gpt-image-2-low-1k"
      );
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-512")
      ).toBe("gemini-3.1-flash-image-preview-512");
      // エイリアス（preview, 2.5-flash-image）は normalize 後に preview-512 へ正規化される
      expect(parseGuestRequestedModel("gemini-3.1-flash-image-preview")).toBe(
        "gemini-3.1-flash-image-preview-512"
      );
      expect(parseGuestRequestedModel("gemini-2.5-flash-image")).toBe(
        "gemini-3.1-flash-image-preview-512"
      );
      // 許可外 Gemini は null
      expect(
        parseGuestRequestedModel("gemini-3.1-flash-image-preview-1024")
      ).toBeNull();
      expect(parseGuestRequestedModel("gemini-3-pro-image-4k")).toBeNull();
    });

    it("isModelAvailableForGeneration: Gemini 系も全部利用可能（未知モデルは引き続き不許可）", () => {
      const { isModelAvailableForGeneration } = loadConfigWithGemini(true);
      expect(isModelAvailableForGeneration("gpt-image-2-low-1k")).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-512")
      ).toBe(true);
      expect(
        isModelAvailableForGeneration("gemini-3.1-flash-image-preview-1024")
      ).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-1k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-3-pro-image-4k")).toBe(true);
      expect(isModelAvailableForGeneration("gemini-2.5-flash-image")).toBe(true);
      expect(isModelAvailableForGeneration("unknown-model")).toBe(false);
    });

    it("resolveEffectiveModelForAuthState: 認証ユーザーの Gemini はそのまま、ゲストは許可リストに照らして丸める", () => {
      const { resolveEffectiveModelForAuthState } = loadConfigWithGemini(true);
      // 認証ユーザーはどの Gemini もそのまま使える
      expect(
        resolveEffectiveModelForAuthState("gemini-3-pro-image-4k", "authenticated")
      ).toBe("gemini-3-pro-image-4k");
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-1024",
          "authenticated"
        )
      ).toBe("gemini-3.1-flash-image-preview-1024");
      // ゲストは preview-512 のみ許可、それ以外の Gemini は default (gpt-image-2-low-1k) に丸める
      expect(
        resolveEffectiveModelForAuthState(
          "gemini-3.1-flash-image-preview-512",
          "guest"
        )
      ).toBe("gemini-3.1-flash-image-preview-512");
      expect(
        resolveEffectiveModelForAuthState("gemini-3-pro-image-4k", "guest")
      ).toBe("gpt-image-2-low-1k");
    });
  });
});
