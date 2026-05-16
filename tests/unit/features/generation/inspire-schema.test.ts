import { generationRequestSchema } from "@/features/generation/lib/schema";

const validBase64 = "iVBORw0KGgo=";
const validMimeType = "image/png";
const validStyleTemplateId = "11111111-1111-4111-8111-111111111111";

const KEEP_ALL = {
  outfit: true,
  angle: true,
  pose: true,
  background: true,
};

describe("generationRequestSchema (inspire 整合性)", () => {
  test("inspire + styleTemplateId + overrides 指定で成功", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
      styleTemplateId: validStyleTemplateId,
      overrides: KEEP_ALL,
    });
    expect(result.success).toBe(true);
  });

  test("inspire + overrides 未指定でも成功（handler 側がデフォルトを補う）", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
      styleTemplateId: validStyleTemplateId,
    });
    expect(result.success).toBe(true);
  });

  test("inspire + styleTemplateId 未指定で失敗", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.styleTemplateId).toBeDefined();
    }
  });

  test("inspire + overrides がすべて false で失敗（最低 1 つ true が必須）", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
      styleTemplateId: validStyleTemplateId,
      overrides: {
        outfit: false,
        angle: false,
        pose: false,
        background: false,
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.overrides).toBeDefined();
    }
  });

  test("inspire 以外で styleTemplateId を指定すると失敗", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "casual outfit",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "coordinate",
      styleTemplateId: validStyleTemplateId,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.styleTemplateId).toBeDefined();
    }
  });

  test("inspire 以外で overrides を指定すると失敗", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "casual outfit",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "coordinate",
      overrides: KEEP_ALL,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.overrides).toBeDefined();
    }
  });

  test("inspire + overrides 各単独 true は成功", () => {
    const singles = [
      { outfit: true, angle: false, pose: false, background: false },
      { outfit: false, angle: true, pose: false, background: false },
      { outfit: false, angle: false, pose: true, background: false },
      { outfit: false, angle: false, pose: false, background: true },
    ];
    for (const overrides of singles) {
      const result = generationRequestSchema.safeParse({
        prompt: "inspire",
        sourceImageBase64: validBase64,
        sourceImageMimeType: validMimeType,
        generationType: "inspire",
        styleTemplateId: validStyleTemplateId,
        overrides,
      });
      expect(result.success).toBe(true);
    }
  });

  test("styleTemplateId が UUID でないと失敗", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
      styleTemplateId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
