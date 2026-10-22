/** @jest-environment node */

import {
  buildGeminiGenerationConfig,
  getGeminiRequestShape,
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
