/** @jest-environment node */

import { buildGeminiGenerationConfig } from "@/supabase/functions/image-gen-worker/gemini-request-config";

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
