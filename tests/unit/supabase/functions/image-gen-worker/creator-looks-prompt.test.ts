/** @jest-environment node */

import {
  composeCreatorLooksPrompt,
  stripBackgroundSection,
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
