/**
 * 画像生成の共通ロジック
 * Next.js API/Client と Supabase Edge Function の両方から利用する。
 */

export type GenerationType =
  | "coordinate"
  | "specified_coordinate"
  | "full_body"
  | "chibi"
  | "one_tap_style";

export const SOURCE_IMAGE_TYPES = ["illustration", "real"] as const;
export type SourceImageType = (typeof SOURCE_IMAGE_TYPES)[number];

export const BACKGROUND_MODES = [
  "ai_auto",
  "include_in_prompt",
  "keep",
] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

/**
 * 旧仕様のbackgroundChange(boolean)を新仕様のbackgroundModeに変換
 */
export function backgroundChangeToBackgroundMode(
  backgroundChange?: boolean | null
): BackgroundMode {
  return backgroundChange ? "ai_auto" : "keep";
}

/**
 * 新仕様のbackgroundModeを旧仕様のbackgroundChange(boolean)に変換
 */
export function backgroundModeToBackgroundChange(
  backgroundMode: BackgroundMode
): boolean {
  return backgroundMode === "ai_auto";
}

/**
 * backgroundModeが未指定/不正値の場合はbackgroundChangeから推論
 */
export function resolveBackgroundMode(
  backgroundMode?: BackgroundMode | string | null,
  backgroundChange?: boolean | null
): BackgroundMode {
  if (
    backgroundMode === "ai_auto" ||
    backgroundMode === "include_in_prompt" ||
    backgroundMode === "keep"
  ) {
    return backgroundMode;
  }
  return backgroundChangeToBackgroundMode(backgroundChange);
}

export interface BuildPromptOptions {
  generationType: GenerationType;
  outfitDescription: string; // ユーザー入力（日本語のまま）
  backgroundMode: BackgroundMode;
  sourceImageType?: SourceImageType;
}

/**
 * プロンプトインジェクション対策: ユーザー入力をサニタイズ
 */
export function sanitizeUserInput(input: string): string {
  let sanitized = input.trim();

  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /forget\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /override\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|commands?)/i,
    /system\s*:?\s*(prompt|instruction|command)/i,
    /<\|(system|user|assistant)\|>/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, "");
    }
  }

  return sanitized.trim();
}

/**
 * プロンプトを構築（プロンプトインジェクション対策済み）
 */
export function buildPrompt(options: BuildPromptOptions): string {
  const {
    generationType,
    outfitDescription,
    backgroundMode,
    sourceImageType = "illustration",
  } = options;
  const sanitizedDescription = sanitizeUserInput(outfitDescription);

  if (!sanitizedDescription || sanitizedDescription.length === 0) {
    throw new Error(
      "Invalid outfit description: empty or contains only prohibited content"
    );
  }

  if (generationType === "coordinate") {
    const coordinateBasePrefix = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation within the Existing Frame (REQUIRED): You MUST replace the person's current clothing with the outfit described under "New Outfit" below. The replacement MUST appear only on body parts that are already visible in \`image_0.png\`. DO NOT extend the crop, widen the framing, or reveal additional body parts (legs, feet, lower body, etc.) that are not visible in the original image. The output image MUST visibly show the new outfit on the parts of the body that were already in frame. Returning the original outfit unchanged is a failure; extending the frame or adding body parts not in the original image is also a failure.

2. Pose & Identity Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`. Do not alter the person's identity.

3. Strict Framing: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a body part is not in the original frame, do not add it. Preserve the exact crop, camera angle, and composition of \`image_0.png\`.`;

    const coordinateRealStyleSuffix =
      "Generate a photorealistic result based on the uploaded photo. Captured with an 85mm portrait lens. Preserve the original camera angle, framing, realistic lighting, and composition. Do not introduce painterly or illustrated rendering.";

    const coordinateIllustrationStyleSuffix =
      "Maintain the exact illustration touch and artistic style of the uploaded image. Preserve the original camera angle, framing, pose, and composition.";

    const coordinateKeepBackgroundSuffix =
      "Keep the entire original background unchanged as much as possible. Do not replace, redesign, or restyle the background.";

    const coordinateChangeBackgroundSuffix =
      "You MUST restyle the background within the existing framing so that it complements the new outfit's style and color palette. Replace or redesign the original background accordingly. Preserve the camera angle, crop, composition, pose, facial features, and character identity.";

    const styleSuffix =
      sourceImageType === "real"
        ? coordinateRealStyleSuffix
        : coordinateIllustrationStyleSuffix;

    const sections: string[] = [coordinateBasePrefix, styleSuffix];

    if (backgroundMode === "keep") {
      sections.push(coordinateKeepBackgroundSuffix);
    } else if (backgroundMode === "ai_auto") {
      sections.push(coordinateChangeBackgroundSuffix);
    }
    // include_in_prompt: ユーザー記述に背景指示を委ねるため、システム側の背景指示は追加しない

    sections.push(`New Outfit:\n\n${sanitizedDescription}`);

    return sections.join("\n\n");
  }

  if (generationType === "specified_coordinate") {
    if (backgroundMode === "keep") {
      return `Edit **only the outfit** of the person in the image to match the provided clothing image.

**New Outfit:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`;
    }

    if (backgroundMode === "ai_auto") {
      return `Edit **only the outfit** of the person in the image to match the provided clothing image, and **generate a new background that complements the new look**.

**New Outfit:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Make sure the updated background still feels cohesive with the character and shares the same illustration style as the original.`;
    }

    return `Edit **the outfit** of the person in the image to match the provided clothing image.

**New Outfit:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style.`;
  }

  if (generationType === "full_body") {
    if (backgroundMode === "keep") {
      return `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions.`;
    }

    if (backgroundMode === "ai_auto") {
      return `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions. Generate a new background that complements the full-body composition.`;
    }

    return `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

${sanitizedDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions.`;
  }

  if (generationType === "chibi") {
    if (backgroundMode === "keep") {
      return `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

${sanitizedDescription}

Keep everything else consistent: face features, hair, pose, expression, the entire background, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features.`;
    }

    if (backgroundMode === "ai_auto") {
      return `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

${sanitizedDescription}

Keep everything else consistent: face features, hair, pose, expression, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features. Generate a new background that complements the chibi style.`;
    }

    return `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

${sanitizedDescription}

Keep everything else consistent: face features, hair, pose, expression, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features.`;
  }

  if (generationType === "one_tap_style") {
    // One-tap style stores a fully assembled style-specific prompt in prompt_text.
    // If this generation type reaches the shared builder, return it as-is after
    // the normal sanitization pass instead of forcing one of the coordinate templates.
    return sanitizedDescription;
  }

  throw new Error(
    `API Error - Configuration '${generationType}' not found. Available types: coordinate, specified_coordinate, full_body, chibi, one_tap_style`
  );
}

/**
 * coordinate 生成タイプ向けのリトライ強化 prefix。
 * attempt=1 は空文字、attempt>=2 で「前回は衣装置換が反映されなかった」旨を Gemini に強く伝える。
 */
export function buildCoordinateAttemptReinforcementPrefix(attempt: number): string {
  if (attempt <= 1) {
    return "";
  }
  return `RETRY NOTICE (attempt ${attempt}): The previous generation failed to apply the requested transformation — the output was either unchanged, only partially modified, or did not reflect the New Outfit described below. You MUST strictly apply the outfit replacement on the body parts already visible in \`image_0.png\`, within the existing frame, and any background instruction below. Do not return the original image unchanged. Do not extend the crop, widen the framing, or add body parts (legs, feet, lower body) that were not visible in \`image_0.png\`.\n\n`;
}
