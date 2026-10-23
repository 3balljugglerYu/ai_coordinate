import {
  GEMINI_API_MODEL_NAMES,
  NANO_BANANA_2_1_CANONICAL_MODELS,
  NANO_BANANA_2_1_PERCOIN_COSTS,
  composeNanoBanana21Model,
  getNanoBanana21ImageSize,
  isNanoBanana21Model,
  parseNanoBanana21Model,
} from "@/shared/generation/gemini-banana-model";
import { OPENAI_IMAGE_PERCOIN_COSTS } from "@/shared/generation/openai-image-model";

// 計画書: docs/planning/nano-banana-2-1-implementation-plan.md(Phase 2)

describe("Nano Banana 2.1 の保存名", () => {
  it("考える量 3 つ × サイズ 3 つの 9 値を、計画書の名前で持つ", () => {
    expect([...NANO_BANANA_2_1_CANONICAL_MODELS].sort()).toEqual(
      [
        "gemini-nano-banana-2.1-minimal-1k",
        "gemini-nano-banana-2.1-minimal-2k",
        "gemini-nano-banana-2.1-minimal-4k",
        "gemini-nano-banana-2.1-medium-1k",
        "gemini-nano-banana-2.1-medium-2k",
        "gemini-nano-banana-2.1-medium-4k",
        "gemini-nano-banana-2.1-high-1k",
        "gemini-nano-banana-2.1-high-2k",
        "gemini-nano-banana-2.1-high-4k",
      ].sort()
    );
  });

  it("compose と parse が 9 値すべてで往復する", () => {
    for (const model of NANO_BANANA_2_1_CANONICAL_MODELS) {
      const parsed = parseNanoBanana21Model(model);
      expect(parsed?.canonical).toBe(model);
      expect(composeNanoBanana21Model(parsed!.thinkingLevel, parsed!.sizeTier)).toBe(model);
    }
    expect(parseNanoBanana21Model("gemini-nano-banana-2.1-high-4k")).toEqual({
      canonical: "gemini-nano-banana-2.1-high-4k",
      thinkingLevel: "high",
      sizeTier: "4k",
    });
  });

  it("2.1 でない値・存在しない組み合わせは null(既存の Nano 2 / Pro も 2.1 扱いしない)", () => {
    for (const value of [
      "gemini-nano-banana-2.1",
      "gemini-nano-banana-2.1-low-1k",
      "gemini-nano-banana-2.1-minimal-0.5k",
      "gemini-3.1-flash-image-preview-1024",
      "gemini-3-pro-image-1k",
      "gpt-image-2-low-1k",
      "",
      null,
      undefined,
    ]) {
      expect([value, parseNanoBanana21Model(value)]).toEqual([value, null]);
      expect([value, isNanoBanana21Model(value)]).toEqual([value, false]);
    }
  });

  it("サイズは Gemini API の imageSize(1K / 2K / 4K)へ変換する", () => {
    expect(getNanoBanana21ImageSize("1k")).toBe("1K");
    expect(getNanoBanana21ImageSize("2k")).toBe("2K");
    expect(getNanoBanana21ImageSize("4k")).toBe("4K");
  });

  it("API に送る名前は gemini-nano-banana-2.1(Phase 0 で models に有ることを確認済み)", () => {
    expect(GEMINI_API_MODEL_NAMES.nano21).toBe("gemini-nano-banana-2.1");
  });
});

describe("NANO_BANANA_2_1_PERCOIN_COSTS", () => {
  it("改定後の通常価格(2026-10-23 ユーザー決定)どおり", () => {
    expect(NANO_BANANA_2_1_PERCOIN_COSTS).toEqual({
      "gemini-nano-banana-2.1-minimal-1k": 20,
      "gemini-nano-banana-2.1-minimal-2k": 30,
      "gemini-nano-banana-2.1-minimal-4k": 60,
      "gemini-nano-banana-2.1-medium-1k": 25,
      "gemini-nano-banana-2.1-medium-2k": 35,
      "gemini-nano-banana-2.1-medium-4k": 65,
      "gemini-nano-banana-2.1-high-1k": 40,
      "gemini-nano-banana-2.1-high-2k": 50,
      "gemini-nano-banana-2.1-high-4k": 80,
    });
  });

  it("どのサイズも、品質の上げ幅は Low → Medium が +5、Medium → High が +15", () => {
    for (const size of ["1k", "2k", "4k"] as const) {
      const low = NANO_BANANA_2_1_PERCOIN_COSTS[`gemini-nano-banana-2.1-minimal-${size}`];
      const medium = NANO_BANANA_2_1_PERCOIN_COSTS[`gemini-nano-banana-2.1-medium-${size}`];
      const high = NANO_BANANA_2_1_PERCOIN_COSTS[`gemini-nano-banana-2.1-high-${size}`];
      expect([size, medium - low, high - medium]).toEqual([size, 5, 15]);
    }
  });

  it("GPT 2.5 の同じ品質・サイズと同じか、それより高い(2.1 のほうが原価が高い)", () => {
    // 内部の minimal は画面の low に当たる(計画書 ADR-002)
    const qualityOf = { minimal: "low", medium: "medium", high: "high" } as const;
    for (const model of NANO_BANANA_2_1_CANONICAL_MODELS) {
      const { thinkingLevel, sizeTier } = parseNanoBanana21Model(model)!;
      const gpt = `gpt-image-2.5-flare-${qualityOf[thinkingLevel]}-${sizeTier}` as const;
      expect([model, NANO_BANANA_2_1_PERCOIN_COSTS[model] >= OPENAI_IMAGE_PERCOIN_COSTS[gpt]]).toEqual([
        model,
        true,
      ]);
    }
  });
});
