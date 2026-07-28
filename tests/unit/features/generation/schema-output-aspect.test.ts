/** @jest-environment node */

import { generationRequestSchema } from "@/features/generation/lib/schema";

// 元画像必須(superRefine)を満たす最小の共通フィールド。
const baseImage = {
  sourceImageBase64: "data:image/png;base64,AAAA",
  sourceImageMimeType: "image/png",
};

describe("generationRequestSchema: outputAspectRatioMode", () => {
  test("free + source は受理される", () => {
    const r = generationRequestSchema.safeParse({
      ...baseImage,
      prompt: "猫",
      generationType: "free",
      outputAspectRatioMode: "source",
    });
    expect(r.success).toBe(true);
  });

  test("free + 明示9比率はすべて受理される", () => {
    for (const ratio of [
      "9:16",
      "4:5",
      "3:4",
      "2:3",
      "1:1",
      "3:2",
      "4:3",
      "5:4",
      "16:9",
    ]) {
      const r = generationRequestSchema.safeParse({
        ...baseImage,
        prompt: "猫",
        generationType: "free",
        outputAspectRatioMode: ratio,
      });
      expect(r.success).toBe(true);
    }
  });

  test("preset_image は 400(enum 外)で拒否される", () => {
    const r = generationRequestSchema.safeParse({
      ...baseImage,
      prompt: "猫",
      generationType: "free",
      outputAspectRatioMode: "preset_image",
    });
    expect(r.success).toBe(false);
  });

  test("不正値は拒否される", () => {
    const r = generationRequestSchema.safeParse({
      ...baseImage,
      prompt: "猫",
      generationType: "free",
      outputAspectRatioMode: "square-ish",
    });
    expect(r.success).toBe(false);
  });

  test("非 free(coordinate)での指定は superRefine で拒否される", () => {
    const r = generationRequestSchema.safeParse({
      ...baseImage,
      prompt: "猫",
      generationType: "coordinate",
      outputAspectRatioMode: "3:4",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.includes("outputAspectRatioMode")),
      ).toBe(true);
    }
  });

  test("未指定は従来どおり受理される(free でも coordinate でも)", () => {
    for (const generationType of ["free", "coordinate"] as const) {
      const r = generationRequestSchema.safeParse({
        ...baseImage,
        prompt: "猫",
        generationType,
      });
      expect(r.success).toBe(true);
    }
  });
});
