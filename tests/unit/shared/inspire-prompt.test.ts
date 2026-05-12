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

  // 「体格・肌色・手足の太さ・胸の大きさが image_1 に寄せられて変わる」報告への対応。
  // 体型保持の指示が全 5 ブランチ・実写/イラスト両バリアントに入っていることを確認する。
  describe("body preservation", () => {
    const targets = [null, "angle", "pose", "outfit", "background"] as const;
    const sources = ["illustration", "real"] as const;

    test("全分岐 × 実写/イラストで image_0 の体型保持指示と否定指示を含む", () => {
      for (const target of targets) {
        for (const sourceImageType of sources) {
          const prompt = buildInspirePrompt({
            overrideTarget: target,
            sourceImageType,
          });
          // image_0 の説明 / item 1 の保持指示
          expect(prompt).toContain("skin tone");
          expect(prompt).toContain("limb");
          expect(prompt).toContain("shoulder width");
          expect(prompt).toContain("overall body silhouette");
          // 否定指示ブロック
          expect(prompt).toContain(
            "Do NOT alter the character's body type to match image_1"
          );
          expect(prompt).toContain("Do NOT change the skin tone");
          // styleSuffix 側の補強文
          expect(prompt).toContain("do not reshape the body to match image_1");
        }
      }
    });

    test("安全フィルタを誘発しやすい文言（chest / breast）を含まない", () => {
      for (const target of targets) {
        for (const sourceImageType of sources) {
          const prompt = buildInspirePrompt({
            overrideTarget: target,
            sourceImageType,
          }).toLowerCase();
          expect(prompt).not.toContain("chest");
          expect(prompt).not.toContain("breast");
        }
      }
    });

    test("override 系でも item 4 の上書き指示と body 専用の否定指示が両立する", () => {
      const outfit = buildInspirePrompt({ overrideTarget: "outfit" });
      expect(outfit).toContain("CHANGE: regenerate the outfit");
      expect(outfit).toContain(
        "Do NOT alter the character's body type to match image_1"
      );

      const pose = buildInspirePrompt({ overrideTarget: "pose" });
      expect(pose).toContain("CHANGE: regenerate the pose");
      expect(pose).toContain(
        "Do NOT alter the character's body type to match image_1"
      );
    });
  });
});
