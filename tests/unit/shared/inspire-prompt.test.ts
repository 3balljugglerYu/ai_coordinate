import { buildInspirePrompt } from "@/shared/generation/prompt-core";

describe("buildInspirePrompt", () => {
  test("keep_all (overrideTarget=null) はテンプレ全要素維持を指示する", () => {
    const prompt = buildInspirePrompt({ overrideTarget: null });
    expect(prompt).toContain("KEEP ALL of the following from image_1");
    expect(prompt).toContain("camera angle, pose, outfit, and background");
  });

  test("angle はカメラアングルだけを変更", () => {
    const prompt = buildInspirePrompt({ overrideTarget: "angle" });
    expect(prompt).toContain("KEEP from image_1: pose, outfit, and background");
    expect(prompt).toContain("CHANGE: regenerate the camera angle");
  });

  test("pose はポーズだけを変更", () => {
    const prompt = buildInspirePrompt({ overrideTarget: "pose" });
    expect(prompt).toContain(
      "KEEP from image_1: camera angle, outfit, and background"
    );
    expect(prompt).toContain("CHANGE: regenerate the pose");
  });

  test("outfit は衣装だけを変更", () => {
    const prompt = buildInspirePrompt({ overrideTarget: "outfit" });
    expect(prompt).toContain(
      "KEEP from image_1: camera angle, pose, and background"
    );
    expect(prompt).toContain("CHANGE: regenerate the outfit");
  });

  test("background は背景だけを変更", () => {
    const prompt = buildInspirePrompt({ overrideTarget: "background" });
    expect(prompt).toContain(
      "KEEP from image_1: camera angle, pose, and outfit"
    );
    expect(prompt).toContain("CHANGE: regenerate the background");
  });

  test("デフォルトは illustration スタイル指示", () => {
    const prompt = buildInspirePrompt({ overrideTarget: null });
    expect(prompt).toContain("Match the illustration touch");
  });

  test('sourceImageType="real" のときは photorealistic 指示', () => {
    const prompt = buildInspirePrompt({
      overrideTarget: null,
      sourceImageType: "real",
    });
    expect(prompt).toContain("photorealistic");
    expect(prompt).toContain("85mm portrait lens");
  });

  test("不明な overrideTarget は throw する", () => {
    expect(() =>
      buildInspirePrompt({
        // 型を意図的にバイパスして runtime エラーパスを検証
        overrideTarget: "unknown" as never,
      })
    ).toThrow(/Unsupported inspire overrideTarget/);
  });

  test("全分岐に共通の image_0/image_1 指示を含む", () => {
    const targets = [null, "angle", "pose", "outfit", "background"] as const;
    for (const target of targets) {
      const prompt = buildInspirePrompt({ overrideTarget: target });
      expect(prompt).toContain("image_0 (User Character)");
      expect(prompt).toContain("image_1 (Style Template)");
      expect(prompt).toContain(
        "Strictly preserves image_1's aspect ratio, framing, and crop"
      );
    }
  });
});
