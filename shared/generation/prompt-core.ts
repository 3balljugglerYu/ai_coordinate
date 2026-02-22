/**
 * 画像生成の共通ロジック
 * Next.js API/Client と Supabase Edge Function の両方から利用する。
 */

export type GenerationType =
  | "coordinate"
  | "specified_coordinate"
  | "full_body"
  | "chibi";

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
  const { generationType, outfitDescription, backgroundMode } = options;
  const sanitizedDescription = sanitizeUserInput(outfitDescription);

  if (!sanitizedDescription || sanitizedDescription.length === 0) {
    throw new Error(
      "Invalid outfit description: empty or contains only prohibited content"
    );
  }

  if (generationType === "coordinate") {
    if (backgroundMode === "keep") {
      return `Maintain the exact illustration touch and artistic style of the uploaded image, and preserve its pose and composition exactly.
Do not change the camera angle or framing from the original image.
Edit only the outfit.

New Outfit:

${sanitizedDescription}`;
    }

    if (backgroundMode === "ai_auto") {
      return `Maintain the exact illustration touch and artistic style of the uploaded image, and preserve its pose and composition exactly.
Do not change the camera angle or framing from the original image.
Adjust the background to match the new outfit’s style and color palette.

New Outfit:

${sanitizedDescription}`;
    }

    // include_in_prompt: 背景についてはシステム指示を追加せず、ユーザー記述に委ねる
    return `Maintain the exact illustration touch and artistic style of the uploaded image, and preserve its pose and composition exactly.
Do not change the camera angle or framing from the original image.

New Outfit:

${sanitizedDescription}`;
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

  throw new Error(
    `API Error - Configuration '${generationType}' not found. Available types: coordinate, specified_coordinate, full_body, chibi`
  );
}
