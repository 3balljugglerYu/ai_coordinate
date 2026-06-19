/** @jest-environment node */

import {
  composeCreatorLooksPrompt,
  stripBackgroundSection,
  extractBackgroundSection,
  composeBackgroundStagePrompt,
} from "@/supabase/functions/image-gen-worker/creator-looks-prompt";

const SAMPLE_HIDDEN_PROMPT = `CRITICAL INSTRUCTION:
This is an Image-to-Image outfit transformation task based on \`image_0.png\`.

Preserve:
Maintain identity.

Edit:
Replace clothing.

Styling Direction:
Head: no hat, no headwear
Upper Body: pastel pink dress

Background: spring cherry blossom park with soft sunlight

Constraints:
No extra limbs.
No identity change.`;

describe("composeCreatorLooksPrompt", () => {
  test("overrideBackground=true なら hidden_prompt をそのまま返す", () => {
    const result = composeCreatorLooksPrompt(SAMPLE_HIDDEN_PROMPT, true);
    expect(result).toBe(SAMPLE_HIDDEN_PROMPT);
  });

  test("overrideBackground=false なら Background セクション除去 + keep 指示追加", () => {
    const result = composeCreatorLooksPrompt(SAMPLE_HIDDEN_PROMPT, false);
    // 元の Background セクションが消えている
    expect(result).not.toContain(
      "Background: spring cherry blossom park with soft sunlight",
    );
    // keep 指示が末尾に付与されている
    expect(result).toContain(
      "Background: keep the original background of `image_0.png` unchanged.",
    );
    // 衣装記述 (Styling Direction) は残る
    expect(result).toContain("Styling Direction:");
    expect(result).toContain("Upper Body: pastel pink dress");
    // Constraints セクションも残る
    expect(result).toContain("Constraints:");
  });

  const CAMERA = "TOP PRIORITY RULE — image_1 is an OUTFIT-ONLY reference: ...";

  test("cameraDirective を渡すと(背景ON)冒頭に前置され hidden_prompt が続く", () => {
    const result = composeCreatorLooksPrompt(SAMPLE_HIDDEN_PROMPT, true, CAMERA);
    expect(result.startsWith(CAMERA)).toBe(true);
    expect(result).toContain(SAMPLE_HIDDEN_PROMPT);
    expect(result).toBe(`${CAMERA}\n\n${SAMPLE_HIDDEN_PROMPT}`);
  });

  test("cameraDirective を渡すと(背景OFF)冒頭に前置され、背景除去+keep も両立", () => {
    const result = composeCreatorLooksPrompt(SAMPLE_HIDDEN_PROMPT, false, CAMERA);
    expect(result.startsWith(CAMERA)).toBe(true);
    // 背景除去 + keep 指示は引き続き効く
    expect(result).not.toContain(
      "Background: spring cherry blossom park with soft sunlight",
    );
    expect(result).toContain(
      "Background: keep the original background of `image_0.png` unchanged.",
    );
    expect(result).toContain("Styling Direction:");
  });

  test("cameraDirective が空文字なら前置しない(従来挙動)", () => {
    expect(composeCreatorLooksPrompt(SAMPLE_HIDDEN_PROMPT, true, "")).toBe(
      SAMPLE_HIDDEN_PROMPT,
    );
    // デフォルト引数(未指定)も同じ
    expect(composeCreatorLooksPrompt(SAMPLE_HIDDEN_PROMPT, true)).toBe(
      SAMPLE_HIDDEN_PROMPT,
    );
  });
});

describe("stripBackgroundSection", () => {
  test("Background セクションを除去する (1 行のみ)", () => {
    const input = `Styling Direction:
Head: nothing

Background: forest

Constraints:
No identity change.`;
    const out = stripBackgroundSection(input);
    expect(out).not.toContain("Background: forest");
    expect(out).toContain("Styling Direction:");
    expect(out).toContain("Constraints:");
  });

  test("Background セクションが複数行に渡る場合も次の見出しまで除去", () => {
    const input = `Styling Direction:
Head: nothing

Background: a vast forest with
deep green trees and morning mist

Constraints:
No identity change.`;
    const out = stripBackgroundSection(input);
    expect(out).not.toContain("Background:");
    expect(out).not.toContain("deep green trees");
    expect(out).toContain("Constraints:");
  });

  test("末尾に Background が来た場合も除去", () => {
    const input = `Styling Direction:
Head: nothing

Background: forest`;
    const out = stripBackgroundSection(input);
    expect(out).not.toContain("Background:");
    expect(out).toContain("Styling Direction:");
  });

  test("Background セクションが無い場合は素通し (= no-op)", () => {
    const input = `Styling Direction:
Head: hat

Constraints:
No identity change.`;
    const out = stripBackgroundSection(input);
    expect(out).toContain("Styling Direction:");
    expect(out).toContain("Constraints:");
    // 元と本質的に同じ (= trim による末尾改行差のみあり得る)
    expect(out.replace(/\s+/g, " ")).toBe(input.replace(/\s+/g, " "));
  });

  test("インデントされた Background も除去", () => {
    const input = `Styling Direction:
Head: nothing

  Background: garden

Constraints:`;
    const out = stripBackgroundSection(input);
    expect(out).not.toContain("Background: garden");
  });

  test("連続改行は最大 1 行にまとめる (= 整形)", () => {
    const input = "A\n\n\n\nB";
    const out = stripBackgroundSection(input);
    expect(out).toBe("A\n\nB");
  });
});

describe("extractBackgroundSection", () => {
  test("Background セクションの本文を取り出す", () => {
    expect(extractBackgroundSection(SAMPLE_HIDDEN_PROMPT)).toBe(
      "spring cherry blossom park with soft sunlight",
    );
  });

  test("複数行の Background も連結して取り出す", () => {
    const t = "Styling Direction:\nHead: x\n\nBackground: a sunny\nbeach resort\n\nConstraints:\nNo";
    expect(extractBackgroundSection(t)).toBe("a sunny beach resort");
  });

  test("Background が無ければ空文字", () => {
    expect(extractBackgroundSection("Styling Direction:\nHead: x")).toBe("");
  });
});

describe("composeBackgroundStagePrompt", () => {
  test("背景のみ変更(衣装維持)の指示と Background 記述を含む", () => {
    const result = composeBackgroundStagePrompt(SAMPLE_HIDDEN_PROMPT);
    expect(result).toContain("Change ONLY the background");
    expect(result).toContain(
      "Background: spring cherry blossom park with soft sunlight",
    );
    // 衣装・キャラを維持する指示
    expect(result).toContain("unchanged");
    expect(result).toContain("Do not change the clothing");
  });

  test("Background 記述が無いときはフォールバック文を使う", () => {
    const result = composeBackgroundStagePrompt("Styling Direction:\nHead: x");
    expect(result).toContain(
      "Background: a scene that matches the outfit's mood and world.",
    );
  });

  test("backgroundDirective(admin編集可)の {{background}} に世界観を差し込む", () => {
    const directive =
      "BACKGROUND STYLE: match image_0 art style.\n\nBackground: {{background}}\n\nRedraw.";
    const result = composeBackgroundStagePrompt(SAMPLE_HIDDEN_PROMPT, directive);
    expect(result).toContain("BACKGROUND STYLE: match image_0 art style.");
    expect(result).toContain(
      "Background: spring cherry blossom park with soft sunlight",
    );
    // フォールバックの固定文ではなく directive が使われる
    expect(result.startsWith("BACKGROUND STYLE")).toBe(true);
  });

  test("backgroundDirective に {background} が無ければ末尾に Background を補う", () => {
    const result = composeBackgroundStagePrompt(
      SAMPLE_HIDDEN_PROMPT,
      "Keep image_0 art style.",
    );
    expect(result).toBe(
      "Keep image_0 art style.\n\nBackground: spring cherry blossom park with soft sunlight",
    );
  });

  test("backgroundDirective が空文字なら従来の固定文(フォールバック)", () => {
    const result = composeBackgroundStagePrompt(SAMPLE_HIDDEN_PROMPT, "");
    expect(result).toContain("Change ONLY the background");
    expect(result).toContain("Do not change the clothing");
  });
});
