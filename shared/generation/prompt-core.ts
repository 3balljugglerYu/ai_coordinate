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
 * Inspire 機能で「テンプレのどの要素を image_0 に適用するか」の組み合わせ。
 *
 * - 4 つすべて true: 「すべて維持」と等価で、image_1 のシーンを丸ごと採用
 * - 個別に true: チェックされた属性だけを image_1 から image_0 に移植
 * - 4 つすべて false: API 側で 400 エラー（UI 側でも生成ボタン disabled）
 */
export interface InspireOverrides {
  outfit: boolean;
  angle: boolean;
  pose: boolean;
  background: boolean;
}

/** 4 つすべて true（=「すべて維持」）かどうかを判定するヘルパ。 */
export function isInspireKeepAll(overrides: InspireOverrides): boolean {
  return (
    overrides.outfit && overrides.angle && overrides.pose && overrides.background
  );
}

/** 少なくとも 1 つチェックされているかを判定するヘルパ（バリデーション用）。 */
export function hasAnyInspireOverride(overrides: InspireOverrides): boolean {
  return (
    overrides.outfit || overrides.angle || overrides.pose || overrides.background
  );
}

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
   * 画像 1 (スタイルテンプレ) から image_0 (ユーザーキャラ) に適用する属性の組み合わせ。
   * 4 つすべて true は「すべて維持」と等価（image_1 のシーンに丸ごとキャラを置く）。
   */
  overrides: InspireOverrides;
}

/**
 * プロンプト前文（全パターン共通・必ず先頭に置く）。
 * モデルに「キャラクター体型を絶対に保持」させるための強い指示。
 *
 * 注: この shared モジュールは Next.js（API/Client）と Supabase Deno Worker の両方から import する。
 * 共有定数はここ（shared/）に置く（lib/ には移さない — Worker から import できないため）。
 */
const INSPIRE_PROMPT_PREAMBLE =
  "絶対に守ること：必ずimage_0のキャラクターの体型は完全に保持してください。";

/**
 * 各 override（チェックボックス）の ON / OFF に対応するアクション文（日本語）。
 *
 * - ON: image_1 から該当属性を image_0 に適用する指示
 * - OFF: image_0 の該当属性を変えない指示
 *
 * 設計指針: 長文や属性列挙はモデルの解釈を散らかして drift を生むため、各属性 1 文で短く。
 * 「キャラ本体の完全保持」は冒頭の前文で強く宣言済みなので、ここでは個別属性だけ書く。
 */
const INSPIRE_ACTION_SENTENCES = {
  outfit: {
    on: "image_1の服をimage_0に着せて下さい。",
    off: "image_0の衣装は変えないでください。",
  },
  angle: {
    on: "image_1のカメラアングル同じカメラアングルをimage_0に適用させてください。",
    off: "image_0のカメラアングルは変えないでください。",
  },
  pose: {
    on: "image_1のポーズと似たようなポーズをimage_0に適用して下さい。",
    off: "image_0のポーズは変えないでください。",
  },
  background: {
    on: "image_1の背景と同じ背景をimage_0に適用して下さい。",
    off: "image_0の背景は変えないでください。",
  },
} as const satisfies Record<keyof InspireOverrides, { on: string; off: string }>;

/**
 * outfit → angle → pose → background の順に、各 override が ON なら ON 文、
 * OFF なら OFF 文を返す（4 文必ず生成）。
 */
function getInspireActionSentences(overrides: InspireOverrides): string[] {
  const order: ReadonlyArray<keyof InspireOverrides> = [
    "outfit",
    "angle",
    "pose",
    "background",
  ];
  return order.map((key) =>
    overrides[key]
      ? INSPIRE_ACTION_SENTENCES[key].on
      : INSPIRE_ACTION_SENTENCES[key].off
  );
}

/**
 * Inspire 生成用のプロンプトを構築する。
 *
 * 入力画像の順序は **必ず以下** とする（Worker / Next.js handler 側で揃えること）:
 *   image_0 = ユーザーがアップロードしたキャラ画像
 *   image_1 = 申請されたスタイルテンプレート画像
 *
 * 出力フレーム比率の起点画像は `resolveInspireTargetSizeBaseIndex(overrides)` で
 * 決まる（4 つすべて true だけ image_1 基準、他は image_0 基準）。両側を同じ overrides で
 * 揃えること。
 *
 * 構造:
 *   1. 前文（体型保持の絶対指示）
 *   2. チェックされた各 override のアクション文（日本語短文）
 *
 * 少なくとも 1 つ override がチェックされている前提（事前に hasAnyInspireOverride で検証する）。
 * チェックなしで呼ぶと action 文が 0 件になり、生成意図不明のプロンプトになる。
 */
export function buildInspirePrompt(options: BuildInspirePromptOptions): string {
  const { overrides } = options;
  const actions = getInspireActionSentences(overrides);
  return [INSPIRE_PROMPT_PREAMBLE, ...actions].join("\n\n");
}

/**
 * Inspire 生成で OpenAI helper に渡す `targetSizeBaseIndex` を解決する。
 *
 * - すべて維持（4 つ true）: image_1 のシーンに置き換える → image_1 のアスペクト比基準（→ 1）
 * - 部分上書き: image_0 を編集する → image_0 のアスペクト比基準（→ 0）
 *
 * caller（preview-generation handler / image-gen-worker）は `callOpenAIImageEditMultiInput*`
 * の `targetSizeBaseIndex` にこの値を渡すこと。プロンプト側のフレーミング指示と一致させる必要がある。
 */
export function resolveInspireTargetSizeBaseIndex(
  overrides: InspireOverrides,
): 0 | 1 {
  return isInspireKeepAll(overrides) ? 1 : 0;
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
