/**
 * 画像生成の共通ロジック
 * Next.js API/Client と Supabase Edge Function の両方から利用する。
 */

export type GenerationType =
  | "coordinate"
  | "specified_coordinate"
  | "full_body"
  | "chibi"
  | "one_tap_style"
  | "inspire";

/**
 * Inspire 機能で「テンプレのどの要素を上書き再生成するか」の対象。
 * null は keep_all を意味し、テンプレの全要素を維持してキャラだけ差し替える。
 */
export type InspireOverrideTarget =
  | "angle"
  | "pose"
  | "outfit"
  | "background";

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

  if (generationType === "inspire") {
    // Inspire のプロンプトは buildInspirePrompt() で別経路から組み立てる。
    // この経路に到達したら呼び出し側のバグなので明示的に失敗させる。
    throw new Error(
      "Inspire generation must use buildInspirePrompt() instead of buildPrompt()."
    );
  }

  throw new Error(
    `API Error - Configuration '${generationType}' not found. Available types: coordinate, specified_coordinate, full_body, chibi, one_tap_style, inspire`
  );
}

export interface BuildInspirePromptOptions {
  /**
   * テンプレのどの要素を上書き再生成するか。null = keep_all（全要素維持してキャラだけ差し替え）。
   */
  overrideTarget: InspireOverrideTarget | null;
  /**
   * ユーザーがアップロードしたキャラ画像が「実写」なのか「イラスト」なのか。
   * Worker は image_jobs.source_image_type から渡す。
   */
  sourceImageType?: SourceImageType;
}

/**
 * Inspire 生成用のプロンプトを構築する。
 *
 * 入力画像の順序は **必ず以下** とする（Worker 側で揃えること）:
 *   image_0 = ユーザーがアップロードしたキャラ画像
 *   image_1 = 申請されたスタイルテンプレート画像
 *
 * 出力フレームの比率はテンプレ（image_1）に合わせる。これはテンプレートの構図を
 * 完全に維持するために必須。Worker 側の `resolveOpenAITargetSize` も image_1 を起点に算出する。
 *
 * 5 ブランチ:
 *   - keep_all (overrideTarget=null): テンプレのアングル/ポーズ/衣装/背景を維持してキャラだけ差し替える
 *   - angle: テンプレのアングルだけを変えて、ポーズ/衣装/背景は維持
 *   - pose: テンプレのポーズだけを変えて、アングル/衣装/背景は維持
 *   - outfit: テンプレの衣装だけを変えて、アングル/ポーズ/背景は維持
 *   - background: テンプレの背景だけを変えて、アングル/ポーズ/衣装は維持
 */
export function buildInspirePrompt(options: BuildInspirePromptOptions): string {
  const { overrideTarget, sourceImageType = "illustration" } = options;

  const styleSuffix =
    sourceImageType === "real"
      ? "Generate a photorealistic result. Captured with an 85mm portrait lens. Use realistic lighting consistent with image_1's environment."
      : "Match the illustration touch and artistic style of image_1 (the style template).";

  const basePrefix = `CRITICAL INSTRUCTION: This is an Image-to-Image task with two reference images:
- image_0 (User Character): the character (face, hair, identity) to render in the output.
- image_1 (Style Template): the visual reference for composition, framing, and overall vibe.

You MUST produce a single output image that:
1. Replaces the character in image_1 with the character from image_0 (preserve image_0's facial features, hair, and identity).
2. Strictly preserves image_1's aspect ratio, framing, and crop. Do NOT extend or change the canvas.`;

  if (overrideTarget === null) {
    return [
      basePrefix,
      `3. KEEP ALL of the following from image_1: camera angle, pose, outfit, and background. Only the character identity is taken from image_0.`,
      `4. The output must look as if the character from image_0 stepped into image_1's exact scene with the same pose, outfit, and background.`,
      styleSuffix,
    ].join("\n\n");
  }

  if (overrideTarget === "angle") {
    return [
      basePrefix,
      `3. KEEP from image_1: pose, outfit, and background.`,
      `4. CHANGE: regenerate the camera angle to a natural alternative (e.g., a different viewpoint of the same scene) while keeping the rest faithful to image_1.`,
      `5. The character identity must come from image_0.`,
      styleSuffix,
    ].join("\n\n");
  }

  if (overrideTarget === "pose") {
    return [
      basePrefix,
      `3. KEEP from image_1: camera angle, outfit, and background.`,
      `4. CHANGE: regenerate the pose to a natural alternative that fits the same scene and outfit.`,
      `5. The character identity must come from image_0.`,
      styleSuffix,
    ].join("\n\n");
  }

  if (overrideTarget === "outfit") {
    return [
      basePrefix,
      `3. KEEP from image_1: camera angle, pose, and background.`,
      `4. CHANGE: regenerate the outfit to a natural alternative that suits the scene and pose.`,
      `5. The character identity must come from image_0.`,
      styleSuffix,
    ].join("\n\n");
  }

  if (overrideTarget === "background") {
    return [
      basePrefix,
      `3. KEEP from image_1: camera angle, pose, and outfit.`,
      `4. CHANGE: regenerate the background to a natural alternative that complements the outfit and pose.`,
      `5. The character identity must come from image_0.`,
      styleSuffix,
    ].join("\n\n");
  }

  throw new Error(
    `Unsupported inspire overrideTarget: ${String(overrideTarget)}`
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
