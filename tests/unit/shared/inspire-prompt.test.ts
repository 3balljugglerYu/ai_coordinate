import {
  buildInspirePrompt,
  resolveInspireTargetSizeBaseIndex,
} from "@/shared/generation/prompt-core";

const ALL_TARGETS = [null, "angle", "pose", "outfit", "background"] as const;
const ALL_SOURCES = ["illustration", "real"] as const;

describe("buildInspirePrompt", () => {
  // 役割宣言は属性を列挙しない（属性列挙すると、たとえ「pose だけ」と指示しても model が
  // image_1 の他属性も取ってしまう drift が観測されたため）。
  describe("役割宣言（属性を列挙しない最小形）", () => {
    test("全分岐 × 実写/イラストで `image_0 = user character; image_1 = style template.` を含む", () => {
      for (const target of ALL_TARGETS) {
        for (const sourceImageType of ALL_SOURCES) {
          const prompt = buildInspirePrompt({
            overrideTarget: target,
            sourceImageType,
          });
          expect(prompt).toContain(
            "Two reference images: image_0 = user character; image_1 = style template."
          );
        }
      }
    });

    test("役割宣言の image_1 側に属性（pose / outfit / background 等）を列挙していない", () => {
      // 旧プロンプトでは `image_1 = style template (composition, camera angle, pose, outfit, background)`
      // のように列挙していて drift の原因になっていた。これを除去できているかをチェックする。
      const prompt = buildInspirePrompt({ overrideTarget: "pose" });
      expect(prompt).not.toMatch(
        /image_1 = style template \([^)]*pose[^)]*\)/i
      );
    });
  });

  describe("ブランチごとのアクション文", () => {
    test("null (keep_all): image_1 のシーン全体 + facial expression を適用、image_0 から identity を取る", () => {
      const prompt = buildInspirePrompt({ overrideTarget: null });
      expect(prompt).toContain(
        "Place the character from image_0 into image_1's scene"
      );
      expect(prompt).toContain(
        "image_1's camera angle, pose, outfit, background, and facial expression"
      );
      expect(prompt).toContain(
        "Replace only the character identity with image_0's"
      );
    });

    test("angle: image_1 のカメラアングルのみ適用、image_0 のポーズ/衣装/背景を維持", () => {
      const prompt = buildInspirePrompt({ overrideTarget: "angle" });
      expect(prompt).toContain(
        "Re-render image_0 from image_1's camera angle and perspective"
      );
      expect(prompt).toContain("Change only the camera angle.");
      expect(prompt).toContain(
        "Keep image_0's pose, outfit, and background unchanged."
      );
      expect(prompt).toContain(
        "Do not take image_1's pose, outfit, or background."
      );
    });

    test("pose: image_1 のポーズ + facial expression のみ適用、image_0 の衣装/背景/アングルを維持", () => {
      const prompt = buildInspirePrompt({ overrideTarget: "pose" });
      expect(prompt).toContain(
        "Apply image_1's pose and facial expression to the character from image_0."
      );
      expect(prompt).toContain("Change only the pose and the facial expression.");
      expect(prompt).toContain(
        "Keep image_0's outfit, background, and camera angle unchanged."
      );
      expect(prompt).toContain(
        "Do not take image_1's outfit, background, or camera angle."
      );
    });

    test("outfit: image_1 の衣装のみ適用、image_0 のポーズ/背景/アングルを維持", () => {
      const prompt = buildInspirePrompt({ overrideTarget: "outfit" });
      expect(prompt).toContain(
        "Dress the character from image_0 in image_1's outfit."
      );
      expect(prompt).toContain("Change only the outfit.");
      expect(prompt).toContain(
        "Keep image_0's pose, background, and camera angle unchanged."
      );
      expect(prompt).toContain(
        "Do not take image_1's pose, background, or camera angle."
      );
    });

    test("background: image_1 の背景のみ適用、image_0 のキャラ/ポーズ/衣装/アングルを維持", () => {
      const prompt = buildInspirePrompt({ overrideTarget: "background" });
      expect(prompt).toContain(
        "Replace the background of image_0 with image_1's background."
      );
      expect(prompt).toContain("Change only the background.");
      expect(prompt).toContain(
        "Keep image_0's character, pose, outfit, and camera angle unchanged."
      );
      expect(prompt).toContain(
        "Do not take image_1's pose, outfit, or camera angle."
      );
    });

    test("不明な overrideTarget は throw する", () => {
      expect(() =>
        buildInspirePrompt({
          // 型を意図的にバイパスして runtime エラーパスを検証
          overrideTarget: "unknown" as never,
        })
      ).toThrow(/Unsupported inspire overrideTarget/);
    });
  });

  // OpenAI ガイド「preserve identity/geometry」を全ブランチで再掲する。
  // 顔の扱いは pose / null だけ image_1 の表情を取るため「facial features (identity)」のみ保持、
  // それ以外は face 丸ごと保持。フレーミングは null だけ image_1、他は image_0 を保持。
  describe("保持節", () => {
    test("全分岐 × 実写/イラストで body 属性（hair / skin tone / body type / limb proportions / head-to-body ratio）を保持", () => {
      for (const target of ALL_TARGETS) {
        for (const sourceImageType of ALL_SOURCES) {
          const prompt = buildInspirePrompt({
            overrideTarget: target,
            sourceImageType,
          });
          expect(prompt).toContain(
            "hair, skin tone, body type, limb proportions, and head-to-body ratio"
          );
          expect(prompt).toContain("Do not extend the canvas.");
        }
      }
    });

    test("null / pose は facial features (identity) を保持（表情は image_1 から差し替え可）", () => {
      for (const target of [null, "pose"] as const) {
        const prompt = buildInspirePrompt({ overrideTarget: target });
        expect(prompt).toContain(
          "Preserve from image_0: facial features (identity),"
        );
      }
    });

    test("angle / outfit / background は face 丸ごと（identity + 表情）を image_0 から保持", () => {
      for (const target of ["angle", "outfit", "background"] as const) {
        const prompt = buildInspirePrompt({ overrideTarget: target });
        expect(prompt).toContain("Preserve from image_0: face,");
      }
    });

    test("null (keep_all) は image_1 のフレーミングを保持", () => {
      const prompt = buildInspirePrompt({ overrideTarget: null });
      expect(prompt).toContain(
        "Preserve image_1's aspect ratio, framing, and crop."
      );
    });

    test("null 以外は image_0 のフレーミングを保持", () => {
      for (const target of [
        "angle",
        "pose",
        "outfit",
        "background",
      ] as const) {
        const prompt = buildInspirePrompt({ overrideTarget: target });
        expect(prompt).toContain(
          "Preserve image_0's aspect ratio, framing, and crop."
        );
      }
    });

    test("安全フィルタを誘発しやすい文言（chest / breast）を含まない", () => {
      for (const target of ALL_TARGETS) {
        for (const sourceImageType of ALL_SOURCES) {
          const prompt = buildInspirePrompt({
            overrideTarget: target,
            sourceImageType,
          }).toLowerCase();
          expect(prompt).not.toContain("chest");
          expect(prompt).not.toContain("breast");
        }
      }
    });
  });

  describe("スタイル suffix", () => {
    test("既定（illustration）は image_1 のイラスト調を一致させる", () => {
      const prompt = buildInspirePrompt({ overrideTarget: null });
      expect(prompt).toContain("Match the illustration art style of image_1.");
    });

    test('sourceImageType="real" は photorealistic 指示', () => {
      const prompt = buildInspirePrompt({
        overrideTarget: null,
        sourceImageType: "real",
      });
      // OpenAI のガイド「include the word 'photorealistic' directly」を踏襲
      expect(prompt).toContain("photorealistic photograph");
    });
  });
});

describe("resolveInspireTargetSizeBaseIndex", () => {
  test("null (keep_all) は image_1 基準（1）", () => {
    expect(resolveInspireTargetSizeBaseIndex(null)).toBe(1);
  });

  test("angle / pose / outfit / background は image_0 基準（0）", () => {
    for (const target of [
      "angle",
      "pose",
      "outfit",
      "background",
    ] as const) {
      expect(resolveInspireTargetSizeBaseIndex(target)).toBe(0);
    }
  });
});
