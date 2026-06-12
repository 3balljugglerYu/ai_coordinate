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

  describe("buildPrompt_coordinate_framingMode", () => {
    const outfitDescription = "オーバーサイズの白シャツとワイドデニム";

    test("free_pose_keepはfree_pose前文とfree_pose背景維持suffixを使いstyle_suffixを含まない", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "real",
        framingMode: "free_pose",
      });

      expect(result).toContain("Flexible Pose & Framing");
      expect(result).not.toContain("Strict Framing");
      expect(result).not.toContain(
        "Outfit Transformation within the Existing Frame"
      );
      expect(result).not.toContain("85mm portrait lens");
      expect(result).toContain(
        "depict the same environment from the new viewpoint"
      );
      expect(result).not.toContain(
        "Keep the entire original background unchanged"
      );
      expect(result).toContain(`New Outfit:\n\n${outfitDescription}`);
    });

    test("free_pose_ai_autoはフレーミング固定を課さない背景変更suffixを使う", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "ai_auto",
        sourceImageType: "illustration",
        framingMode: "free_pose",
      });

      expect(result).toContain(
        "designed freely to suit the new pose, camera angle, and framing"
      );
      expect(result).not.toContain("within the existing framing");
      expect(result).not.toContain(
        "Maintain the exact illustration touch and artistic style"
      );
    });

    test("free_pose_include_in_promptは背景suffixを含まない", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "include_in_prompt",
        sourceImageType: "illustration",
        framingMode: "free_pose",
      });

      expect(result).toContain("Flexible Pose & Framing");
      expect(result).not.toContain("depict the same environment");
      expect(result).not.toContain("designed freely to suit the new pose");
    });

    test("framingMode省略とlockedは完全一致する_後方互換", () => {
      const omitted = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "real",
      });
      const locked = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "real",
        framingMode: "locked",
      });

      expect(locked).toBe(omitted);
      expect(omitted).toContain("Strict Framing");
    });

    test("templatesでbase_prefix_free_poseをoverrideできる", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "illustration",
        framingMode: "free_pose",
        templates: {
          "coordinate.base_prefix_free_pose": "CUSTOM FREE POSE PREFIX",
        },
      });

      expect(result).toContain("CUSTOM FREE POSE PREFIX");
      expect(result).not.toContain("Flexible Pose & Framing");
    });

    test("ai_poseはCreative前文を使いポーズの写し取りを禁止する", () => {
      const result = buildPrompt({
        generationType: "coordinate",
        outfitDescription,
        backgroundMode: "keep",
        sourceImageType: "real",
        framingMode: "ai_pose",
      });

      expect(result).toContain("Creative Pose & Framing");
      expect(result).toContain("Do NOT simply copy the pose");
      expect(result).not.toContain("Flexible Pose & Framing");
      expect(result).not.toContain("Strict Framing");
      expect(result).not.toContain("85mm portrait lens");
      // 背景 suffix は free_pose と共通の変種を使う
      expect(result).toContain(
        "depict the same environment from the new viewpoint"
      );
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

    test("free_poseのattempt1は空文字を返す", () => {
      expect(
        buildCoordinateAttemptReinforcementPrefix(1, undefined, "free_pose")
      ).toBe("");
    });

    test("free_poseのattempt2以降は枠維持制約を含まない変種を使う", () => {
      const prefix = buildCoordinateAttemptReinforcementPrefix(
        2,
        undefined,
        "free_pose"
      );

      expect(prefix).toContain("RETRY NOTICE (attempt 2)");
      expect(prefix).not.toContain("Do not extend the crop");
      expect(prefix).toContain("allowed to change");
      expect(prefix.endsWith("\n\n")).toBe(true);
    });

    test("ai_poseも枠維持制約を含まない変種を使う", () => {
      const prefix = buildCoordinateAttemptReinforcementPrefix(
        2,
        undefined,
        "ai_pose"
      );

      expect(prefix).not.toContain("Do not extend the crop");
      expect(prefix).toContain("allowed to change");
    });
  });
});
