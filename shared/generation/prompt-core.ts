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
 * Inspire 生成で image_0 から保持する身体属性の正典リスト。
 * face / facial features (identity) はブランチによって扱いが変わる（pose と keep_all は
 * image_1 の表情を取るので「facial features (identity)」のみ保持、それ以外は face 丸ごと
 * 保持）ためここには含めない。
 *
 * 注: この shared モジュールは Next.js（API/Client）と Supabase Deno Worker の両方から import する。
 * 共有定数はここ（shared/）に置く（lib/ には移さない — Worker から import できないため）。
 */
const INSPIRE_BODY_ATTRIBUTES =
  "hair, skin tone, body type, limb proportions, and head-to-body ratio";

/**
 * 役割宣言（全ブランチ共通の冒頭 1 行）。
 *
 * image_1 側に属性（pose / outfit / background など）を列挙すると、たとえアクション 1 文で
 * 「pose だけを適用」と指示しても model が他の属性も image_1 から取ってしまう drift が
 * 観測された。OpenAI のガイド「Reference each input by index and description」を踏襲しつつ、
 * 属性の列挙はせず「ユーザーキャラ / スタイルテンプレ」だけを名付ける。
 */
const INSPIRE_ROLE_DECLARATION =
  "Two reference images: image_0 = user character; image_1 = style template.";

const INSPIRE_ILLUSTRATION_SUFFIX =
  "Match the illustration art style of image_1.";
const INSPIRE_PHOTOREALISTIC_SUFFIX =
  "Render the result as a photorealistic photograph, with realistic lighting consistent with the scene.";

/**
 * ブランチごとのアクション文。OpenAI のガイド「change only X + keep everything else
 * the same」「保持リストは毎回繰り返す」の趣旨に従い、各文に
 * 「change only X」「Keep Y, Z unchanged. Do not take ...」を明示する。
 *
 * セマンティクス:
 *   - null (keep_all): image_1 の全要素（camera angle / pose / outfit / background /
 *     facial expression）を採用し、image_0 はキャラ identity のみ
 *   - angle / pose / outfit / background: image_0 の世界を保ち、image_1 から該当 1 属性
 *     のみを移植
 *     - pose だけ追加で image_1 の facial expression も取る（ポーズと表情はセットで
 *       自然になるため）
 */
function getInspireActionSentence(
  overrideTarget: InspireOverrideTarget | null,
): string {
  switch (overrideTarget) {
    case null:
      return "Place the character from image_0 into image_1's scene, adopting image_1's camera angle, pose, outfit, background, and facial expression. Replace only the character identity with image_0's.";
    case "angle":
      return "Re-render image_0 from image_1's camera angle and perspective. Change only the camera angle. Keep image_0's pose, outfit, and background unchanged. Do not take image_1's pose, outfit, or background.";
    case "pose":
      return "Apply image_1's pose and facial expression to the character from image_0. Change only the pose and the facial expression. Keep image_0's outfit, background, and camera angle unchanged. Do not take image_1's outfit, background, or camera angle.";
    case "outfit":
      return "Dress the character from image_0 in image_1's outfit. Change only the outfit. Keep image_0's pose, background, and camera angle unchanged. Do not take image_1's pose, background, or camera angle.";
    case "background":
      return "Replace the background of image_0 with image_1's background. Change only the background. Keep image_0's character, pose, outfit, and camera angle unchanged. Do not take image_1's pose, outfit, or camera angle.";
    default:
      throw new Error(
        `Unsupported inspire overrideTarget: ${String(overrideTarget)}`,
      );
  }
}

/**
 * 保持節（OpenAI ガイドの「preserve identity/geometry/...」を踏襲、全ブランチで再掲する）。
 *
 * - null / pose: image_1 から facial expression を取るため、image_0 で保持するのは
 *   「facial features (identity)」のみ（表情は image_1 から差し替え可）
 * - angle / outfit / background: face 全体（identity + 表情）を image_0 から保持
 *
 * またフレーミング保持先もブランチで変わる:
 * - null (keep_all): image_1 のシーンに移植 → image_1 の aspect ratio / framing / crop を保持
 * - その他: image_0 を編集 → image_0 の aspect ratio / framing / crop を保持
 *   出力サイズの起点画像は `resolveInspireTargetSizeBaseIndex` で揃えること。
 */
function getInspirePreserveClause(
  overrideTarget: InspireOverrideTarget | null,
): string {
  const facePart =
    overrideTarget === null || overrideTarget === "pose"
      ? "facial features (identity)"
      : "face";
  const framingSentence =
    overrideTarget === null
      ? "Preserve image_1's aspect ratio, framing, and crop."
      : "Preserve image_0's aspect ratio, framing, and crop.";
  return `Preserve from image_0: ${facePart}, ${INSPIRE_BODY_ATTRIBUTES}. ${framingSentence} Do not extend the canvas.`;
}

/**
 * Inspire 生成用のプロンプトを構築する。
 *
 * 入力画像の順序は **必ず以下** とする（Worker / Next.js handler 側で揃えること）:
 *   image_0 = ユーザーがアップロードしたキャラ画像
 *   image_1 = 申請されたスタイルテンプレート画像
 *
 * 出力フレーム比率の起点画像は `resolveInspireTargetSizeBaseIndex(overrideTarget)` で
 * 決まる（null だけ image_1 基準、他は image_0 基準）。両側を同じ overrideTarget で
 * 揃えること。
 *
 * 構造（OpenAI 推奨「scene → subject → details → constraints」に近い 4 段）:
 *   1. 役割宣言（属性は列挙しない。drift を抑えるため）
 *   2. ブランチごとのアクション 1 文（change only X + keep Y, Z）
 *   3. 保持節（毎回再掲。null / pose は identity のみ、他は face 丸ごと）
 *   4. スタイル suffix（実写なら photorealistic、それ以外は image_1 のイラスト調）
 *
 * セマンティクス（5 ブランチ、非対称）:
 *   - null (keep_all): image_1 の全要素 + facial expression を採用、キャラ identity と
 *     body は image_0 から。フレーミングは image_1
 *   - angle: image_1 のカメラアングルのみ採用、image_0 のポーズ/衣装/背景を維持
 *   - pose: image_1 のポーズ + facial expression のみ採用、image_0 の衣装/背景/アングルを維持
 *   - outfit: image_1 の衣装のみ採用、image_0 のポーズ/背景/アングルを維持
 *   - background: image_1 の背景のみ採用、image_0 のキャラ/ポーズ/衣装/アングルを維持
 */
export function buildInspirePrompt(options: BuildInspirePromptOptions): string {
  const { overrideTarget, sourceImageType = "illustration" } = options;
  const action = getInspireActionSentence(overrideTarget);
  const preserve = getInspirePreserveClause(overrideTarget);
  const style =
    sourceImageType === "real"
      ? INSPIRE_PHOTOREALISTIC_SUFFIX
      : INSPIRE_ILLUSTRATION_SUFFIX;
  return [INSPIRE_ROLE_DECLARATION, action, preserve, style].join("\n\n");
}

/**
 * Inspire 生成で OpenAI helper に渡す `targetSizeBaseIndex` を解決する。
 *
 * - null (keep_all): image_1 のシーンに置き換える → image_1 のアスペクト比を起点（→ 1）
 * - その他: image_0 を編集する（1 属性だけ image_1 から移植）→ image_0 のアスペクト比を起点（→ 0）
 *
 * caller（preview-generation handler / image-gen-worker）は `callOpenAIImageEditMultiInput*`
 * の `targetSizeBaseIndex` にこの値を渡すこと。プロンプト側の保持節（image_0 / image_1 の
 * どちらのフレーミングを保つか）と一致させる必要がある。
 */
export function resolveInspireTargetSizeBaseIndex(
  overrideTarget: InspireOverrideTarget | null,
): 0 | 1 {
  return overrideTarget === null ? 1 : 0;
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
