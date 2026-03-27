import { extractImageSize } from "@/features/generation/types";

describe("generation types", () => {
  test("extractImageSize_1K用内部モデルはGemini APIへ1Kを返す", () => {
    expect(extractImageSize("gemini-3.1-flash-image-preview-1024")).toBe("1K");
  });

  test("extractImageSize_0_5K用内部モデルはGemini APIへ512を返す", () => {
    expect(extractImageSize("gemini-3.1-flash-image-preview-512")).toBe("512");
  });
});
