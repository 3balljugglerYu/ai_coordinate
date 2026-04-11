import { buildPrompt } from "@/shared/generation/prompt-core";

describe("shared/generation/prompt-core", () => {
  test("buildPrompt_one_tap_styleは組み立て済みプロンプトをそのまま返す", () => {
    const prebuiltPrompt = `CRITICAL INSTRUCTION: This is an Image-to-Image task.

Styling Direction:
Minimal monochrome look`;

    expect(
      buildPrompt({
        generationType: "one_tap_style",
        outfitDescription: prebuiltPrompt,
        backgroundMode: "keep",
        sourceImageType: "illustration",
      })
    ).toBe(prebuiltPrompt);
  });
});
