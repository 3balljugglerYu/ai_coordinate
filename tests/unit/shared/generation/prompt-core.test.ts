import {
  buildCoordinateAttemptReinforcementPrefix,
  buildPrompt,
} from "@/shared/generation/prompt-core";

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

  describe("buildPrompt_coordinate", () => {
    const outfitDescription = "オーバーサイズの白シャツとワイドデニム";

    test("real_keepはphotorealistic指示と背景維持suffixを含む", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "real",
      });

      expect(result).toContain("CRITICAL INSTRUCTION");
      expect(result).toContain(
        "Outfit Transformation within the Existing Frame (REQUIRED)"
      );
      expect(result).toContain(
        "DO NOT extend the crop, widen the framing, or reveal additional body parts"
      );
      expect(result).toContain("Strict Framing");
      expect(result).toContain("photorealistic result");
      expect(result).toContain("85mm portrait lens");
      expect(result).toContain("Keep the entire original background unchanged");
      expect(result).not.toContain("You MUST restyle the background");
      expect(result).toContain(`New Outfit:\n\n${outfitDescription}`);
    });

    test("real_ai_autoはMUST背景変更suffixを含む", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "ai_auto",
        sourceImageType: "real",
      });

      expect(result).toContain("photorealistic result");
      expect(result).toContain("You MUST restyle the background");
      expect(result).not.toContain(
        "Keep the entire original background unchanged"
      );
    });

    test("real_include_in_promptは背景suffixを含まない", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "include_in_prompt",
        sourceImageType: "real",
      });

      expect(result).toContain("photorealistic result");
      expect(result).not.toContain(
        "Keep the entire original background unchanged"
      );
      expect(result).not.toContain("You MUST restyle the background");
    });

    test("illustration_keepはillustration指示と背景維持suffixを含む", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "illustration",
      });

      expect(result).toContain(
        "Maintain the exact illustration touch and artistic style"
      );
      expect(result).not.toContain("photorealistic result");
      expect(result).toContain("Keep the entire original background unchanged");
    });

    test("illustration_ai_autoはMUST背景変更suffixを含む", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "ai_auto",
        sourceImageType: "illustration",
      });

      expect(result).toContain(
        "Maintain the exact illustration touch and artistic style"
      );
      expect(result).toContain("You MUST restyle the background");
    });

    test("illustration_include_in_promptは背景suffixを含まない", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "include_in_prompt",
        sourceImageType: "illustration",
      });

      expect(result).toContain(
        "Maintain the exact illustration touch and artistic style"
      );
      expect(result).not.toContain(
        "Keep the entire original background unchanged"
      );
      expect(result).not.toContain("You MUST restyle the background");
    });

    test("セクション順序はbase_styleSuffix_backgroundSuffix_newOutfit", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "real",
      });

      const baseIdx = result.indexOf("CRITICAL INSTRUCTION");
      const styleIdx = result.indexOf("photorealistic result");
      const bgIdx = result.indexOf(
        "Keep the entire original background unchanged"
      );
      const outfitIdx = result.indexOf("New Outfit:");

      expect(baseIdx).toBeGreaterThanOrEqual(0);
      expect(styleIdx).toBeGreaterThan(baseIdx);
      expect(bgIdx).toBeGreaterThan(styleIdx);
      expect(outfitIdx).toBeGreaterThan(bgIdx);
    });
  });

  describe("buildCoordinateAttemptReinforcementPrefix", () => {
    test("attempt1は空文字を返す", () => {
      expect(buildCoordinateAttemptReinforcementPrefix(1)).toBe("");
    });

    test("attempt2以降はRETRY_NOTICEと枠維持制約を含む", () => {
      const prefix = buildCoordinateAttemptReinforcementPrefix(2);

      expect(prefix).toContain("RETRY NOTICE (attempt 2)");
      expect(prefix).toContain("body parts already visible in `image_0.png`");
      expect(prefix).toContain("Do not extend the crop");
      expect(prefix).toContain("New Outfit");
      expect(prefix.endsWith("\n\n")).toBe(true);
    });

    test("attempt番号がメッセージに埋め込まれる", () => {
      expect(buildCoordinateAttemptReinforcementPrefix(3)).toContain(
        "RETRY NOTICE (attempt 3)"
      );
    });
  });
});
