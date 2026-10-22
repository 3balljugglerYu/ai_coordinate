import {
  DEFAULT_GENERATION_MODEL,
  FALLBACK_GENERATION_MODEL,
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
    test("既定モデルは ChatGPT Images 2.5 (gpt-image-2.5-flare-low-1k)", () => {
      expect(DEFAULT_GENERATION_MODEL).toBe("gpt-image-2.5-flare-low-1k");
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
      // 未知の OpenAI 風文字列は FALLBACK(常に誰でも実行できる 2.0)へ寄せる。
      // 既定(2.5)に寄せると、段階公開フラグ OFF のときサーバーのゲートで
      // 弾かれて生成できなくなるため。
      expect(normalizeModelName("gpt-image-bogus")).toBe(
        FALLBACK_GENERATION_MODEL
      );
    });
  });

  describe("toApiModelName", () => {
    test("Gemini 系のサイズ付き ID を Gemini API の GA 名へ変換(プレビュー名は送らない)", () => {
      // プレビュー名は公式の停止予定日 2026-06-25 を過ぎている。DB の保存名は変えず、
      // API に送る名前だけを GA 名にする(nano-banana-2-1 計画書 ADR-004)。
      expect(toApiModelName("gemini-3.1-flash-image-preview-512")).toBe(
        "gemini-3.1-flash-image"
      );
      expect(toApiModelName("gemini-3.1-flash-image-preview-1024")).toBe(
        "gemini-3.1-flash-image"
      );
      expect(toApiModelName("gemini-3-pro-image-1k")).toBe("gemini-3-pro-image");
      expect(toApiModelName("gemini-3-pro-image-2k")).toBe("gemini-3-pro-image");
      expect(toApiModelName("gemini-3-pro-image-4k")).toBe("gemini-3-pro-image");
      expect(toApiModelName("gemini-2.5-flash-image")).toBe("gemini-2.5-flash-image");
    });

    test("Nano Banana 2.1 の 9 値は gemini-nano-banana-2.1 へ(gemini-2.5-flash-image に落とさない)", () => {
      expect(toApiModelName("gemini-nano-banana-2.1-minimal-1k")).toBe("gemini-nano-banana-2.1");
      expect(toApiModelName("gemini-nano-banana-2.1-medium-2k")).toBe("gemini-nano-banana-2.1");
      expect(toApiModelName("gemini-nano-banana-2.1-high-4k")).toBe("gemini-nano-banana-2.1");
    });

    test("OpenAI 系を渡したらランタイム例外", () => {
      expect(() =>
        // 型上は GeminiOnlyModel に絞られているが、unknown 経由の誤投入を防ぐためのガード
        toApiModelName("gpt-image-2-low-1k" as never)
      ).toThrow(/OpenAI image models are not Gemini-routable/);
    });
  });

  describe("Nano Banana 2.1(Phase 2 の時点)", () => {
    test("extractImageSize はサイズを 1K / 2K / 4K で返す", () => {
      expect(extractImageSize("gemini-nano-banana-2.1-minimal-1k")).toBe("1K");
      expect(extractImageSize("gemini-nano-banana-2.1-medium-2k")).toBe("2K");
      expect(extractImageSize("gemini-nano-banana-2.1-high-4k")).toBe("4K");
    });

    test("運営だけのゲート(Phase 3)ができるまで、API の入力としては受け付けない", () => {
      // 先に受け付けると、一般の利用者が直接リクエストして 2.1 を指定できてしまう。
      // Phase 3 でゲートと一緒に開ける(そのときこのテストを書き換える)。
      expect(isKnownModelInput("gemini-nano-banana-2.1-minimal-1k")).toBe(false);
      expect(
        (KNOWN_MODEL_INPUTS as ReadonlyArray<string>).some((m) =>
          m.startsWith("gemini-nano-banana-2.1")
        )
      ).toBe(false);
    });
  });
});
