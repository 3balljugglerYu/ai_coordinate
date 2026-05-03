import { generationRequestSchema } from "@/features/generation/lib/schema";

const validBase64 = "iVBORw0KGgo=";
const validMimeType = "image/png";
const validStyleTemplateId = "11111111-1111-4111-8111-111111111111";

describe("generationRequestSchema (inspire 整合性)", () => {
  test("inspire + styleTemplateId 指定で成功", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
      styleTemplateId: validStyleTemplateId,
      overrideTarget: "angle",
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

  test("inspire 以外で overrideTarget を指定すると失敗", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "casual outfit",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "coordinate",
      overrideTarget: "angle",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = result.error.flatten();
      expect(flat.fieldErrors.overrideTarget).toBeDefined();
    }
  });

  test("inspire + overrideTarget=null (keep_all) は成功", () => {
    const result = generationRequestSchema.safeParse({
      prompt: "inspire",
      sourceImageBase64: validBase64,
      sourceImageMimeType: validMimeType,
      generationType: "inspire",
      styleTemplateId: validStyleTemplateId,
      overrideTarget: null,
    });
    expect(result.success).toBe(true);
  });

  test("inspire + overrideTarget の各 enum 値は成功", () => {
    const targets = ["angle", "pose", "outfit", "background"] as const;
    for (const target of targets) {
      const result = generationRequestSchema.safeParse({
        prompt: "inspire",
        sourceImageBase64: validBase64,
        sourceImageMimeType: validMimeType,
        generationType: "inspire",
        styleTemplateId: validStyleTemplateId,
        overrideTarget: target,
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
