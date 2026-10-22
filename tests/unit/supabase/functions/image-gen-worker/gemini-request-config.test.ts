/** @jest-environment node */

import {
  buildGeminiGenerationConfig,
  getGeminiRequestShape,
  parseGeminiUsageMetadata,
  resolveNanoBanana21RequestTimeoutMs,
  resolveNanoBanana21ThinkingLevel,
} from "@/supabase/functions/image-gen-worker/gemini-request-config";

describe("buildGeminiGenerationConfig", () => {
  test("imageSize がある場合は imageConfig に imageSize と aspectRatio を併置", () => {
    const result = buildGeminiGenerationConfig({
      imageSize: "1K",
      aspectRatio: "9:16",
    });
    expect(result).toEqual({
      imageConfig: {
        imageSize: "1K",
        aspectRatio: "9:16",
      },
    });
  });

  test("imageSize が null でも aspectRatio は必ず送られる (gemini-2.5-flash-image 等)", () => {
    const result = buildGeminiGenerationConfig({
      imageSize: null,
      aspectRatio: "1:1",
    });
    expect(result).toEqual({
      imageConfig: {
        aspectRatio: "1:1",
      },
    });
    expect(result.imageConfig.imageSize).toBeUndefined();
  });

  test("requiresResponseModalities=true で candidateCount と responseModalities を追加", () => {
    const result = buildGeminiGenerationConfig({
      imageSize: "2K",
      aspectRatio: "16:9",
      requiresResponseModalities: true,
    });
    expect(result).toEqual({
      candidateCount: 1,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        imageSize: "2K",
        aspectRatio: "16:9",
      },
    });
  });

  test("requiresResponseModalities=false (default) では candidateCount を含めない", () => {
    const result = buildGeminiGenerationConfig({
      imageSize: "1K",
      aspectRatio: "4:3",
      requiresResponseModalities: false,
    });
    expect(result.candidateCount).toBeUndefined();
    expect(result.responseModalities).toBeUndefined();
  });

  test("imageSize=null + requiresResponseModalities=true の組み合わせ", () => {
    const result = buildGeminiGenerationConfig({
      imageSize: null,
      aspectRatio: "3:4",
      requiresResponseModalities: true,
    });
    expect(result).toEqual({
      candidateCount: 1,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: "3:4",
      },
    });
  });
});

describe("getGeminiRequestShape", () => {
  // worker の apiModel の文字列比較 4 か所をここへ集めた。GA 名へ置き換えたあとも、
  // モデルごとのリクエストの形はプレビュー名のときと変えない(nano-banana-2-1 計画書 Phase 1)。
  test("Nano 2(gemini-3.1-flash-image)は imageSize 必須・送る・candidateCount と responseModalities あり", () => {
    expect(getGeminiRequestShape("gemini-3.1-flash-image")).toEqual({
      requiresImageSize: true,
      sendsImageSize: true,
      requiresResponseModalities: true,
    });
  });

  test("Pro(gemini-3-pro-image)は imageSize を送るが、responseModalities は付けない", () => {
    expect(getGeminiRequestShape("gemini-3-pro-image")).toEqual({
      requiresImageSize: false,
      sendsImageSize: true,
      requiresResponseModalities: false,
    });
  });

  test("Nano Banana 2.1(gemini-nano-banana-2.1)は Nano 2 と同じ形(imageSize を送らないと 4K を選んでも 1K で返る)", () => {
    // Phase 0(2026-10-22)で、この形で 1K / 2K / 4K とも通ることを確認済み
    expect(getGeminiRequestShape("gemini-nano-banana-2.1")).toEqual({
      requiresImageSize: true,
      sendsImageSize: true,
      requiresResponseModalities: true,
    });
  });

  test("gemini-2.5-flash-image は imageSize も responseModalities も付けない", () => {
    expect(getGeminiRequestShape("gemini-2.5-flash-image")).toEqual({
      requiresImageSize: false,
      sendsImageSize: false,
      requiresResponseModalities: false,
    });
  });
});

describe("Nano Banana 2.1 の考える量(thinkingLevel)", () => {
  // Phase 0(2026-10-22): generationConfig.thinkingConfig.thinkingLevel に小文字で送ると通る
  test("thinkingLevel を渡すと thinkingConfig に載る", () => {
    expect(
      buildGeminiGenerationConfig({
        imageSize: "2K",
        aspectRatio: "3:4",
        requiresResponseModalities: true,
        thinkingLevel: "medium",
      })
    ).toEqual({
      candidateCount: 1,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { imageSize: "2K", aspectRatio: "3:4" },
      thinkingConfig: { thinkingLevel: "medium" },
    });
  });

  test("thinkingLevel が無い(2.1 以外)ときは thinkingConfig を付けない(既存モデルの形を変えない)", () => {
    const result = buildGeminiGenerationConfig({
      imageSize: "1K",
      aspectRatio: "1:1",
      requiresResponseModalities: true,
      thinkingLevel: null,
    });
    expect(result).not.toHaveProperty("thinkingConfig");
  });

  test("保存名から考える量を取り出す。2.1 以外は null", () => {
    expect(resolveNanoBanana21ThinkingLevel("gemini-nano-banana-2.1-minimal-1k")).toBe("minimal");
    expect(resolveNanoBanana21ThinkingLevel("gemini-nano-banana-2.1-medium-4k")).toBe("medium");
    expect(resolveNanoBanana21ThinkingLevel("gemini-nano-banana-2.1-high-2k")).toBe("high");
    expect(resolveNanoBanana21ThinkingLevel("gemini-3.1-flash-image-preview-1024")).toBeNull();
    expect(resolveNanoBanana21ThinkingLevel("gpt-image-2-low-1k")).toBeNull();
  });
});

describe("resolveNanoBanana21RequestTimeoutMs(ADR-007)", () => {
  test("2.1 はサイズごとに明示のタイムアウト(既定の 60 秒に落とさない・REQ-009)", () => {
    for (const thinking of ["minimal", "medium", "high"]) {
      expect(resolveNanoBanana21RequestTimeoutMs(`gemini-nano-banana-2.1-${thinking}-1k`)).toBe(120_000);
      expect(resolveNanoBanana21RequestTimeoutMs(`gemini-nano-banana-2.1-${thinking}-2k`)).toBe(180_000);
      expect(resolveNanoBanana21RequestTimeoutMs(`gemini-nano-banana-2.1-${thinking}-4k`)).toBe(300_000);
    }
  });

  test("2.1 以外は null(呼び出し側の既存の表を使う)", () => {
    expect(resolveNanoBanana21RequestTimeoutMs("gemini-3-pro-image-4k")).toBeNull();
  });
});

describe("parseGeminiUsageMetadata(REQ-008)", () => {
  test("usageMetadata のトークン数を読む(考える分を含む)", () => {
    expect(
      parseGeminiUsageMetadata({
        usageMetadata: {
          promptTokenCount: 1142,
          candidatesTokenCount: 1396,
          thoughtsTokenCount: 318,
          totalTokenCount: 2856,
          promptTokensDetails: [{ modality: "IMAGE", tokenCount: 1120 }],
        },
      })
    ).toEqual({
      promptTokenCount: 1142,
      candidatesTokenCount: 1396,
      thoughtsTokenCount: 318,
      totalTokenCount: 2856,
    });
  });

  test("考える分が無い(minimal など)ときは thoughtsTokenCount を 0 にする", () => {
    expect(
      parseGeminiUsageMetadata({
        usageMetadata: { promptTokenCount: 1142, candidatesTokenCount: 1352, totalTokenCount: 2494 },
      })
    ).toEqual({
      promptTokenCount: 1142,
      candidatesTokenCount: 1352,
      thoughtsTokenCount: 0,
      totalTokenCount: 2494,
    });
  });

  test("usageMetadata が無い・数でないときは null", () => {
    expect(parseGeminiUsageMetadata(null)).toBeNull();
    expect(parseGeminiUsageMetadata({})).toBeNull();
    expect(
      parseGeminiUsageMetadata({ usageMetadata: { promptTokenCount: "1142", candidatesTokenCount: 10 } })
    ).toBeNull();
  });
});
