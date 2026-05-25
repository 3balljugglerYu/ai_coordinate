/**
 * 生成 prompt の registry。
 *
 * 各 key の defaultContent / category / supportedVariables / previewSamples を一元管理し、
 * admin が DB override を入れていない場合のフォールバック値とする。
 *
 * 設計:
 * - **pure (ランタイム依存ゼロ)**: Next.js / Edge Function (Deno) / client component (型) の
 *   全ランタイムから安全に import 可能 (ADR-007)
 * - **registry を真とする**: DB の prompt_overrides は registry に存在する key のみ有効。
 *   未知 key (DB にあるが registry にない) は admin UI の「孤立 row」セクションに表示し
 *   削除専用とする
 *
 * 詳細: docs/planning/admin-generation-prompt-editor-plan.md
 */

/**
 * admin UI 上のカテゴリ。一覧画面でグループ表示する単位。
 *
 * - style: Style 画面 (One-Tap Style) で使われる prompt
 * - coordinate: 通常 / specified / full_body / chibi コーディネート
 * - inspire: Inspire テンプレ適用時の指示文 (preamble + override 4 種 on/off)
 * - reinforcement: リトライ時の強化 prefix (coordinate / style 別)
 */
export const PROMPT_CATEGORIES = [
  "style",
  "coordinate",
  "inspire",
  "reinforcement",
] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export interface PromptDefinition {
  /** UI 一覧でグループ表示するカテゴリ */
  category: PromptCategory;
  /** admin UI に表示する人向け説明 (ja) */
  description: string;
  /** DB に override が無い場合に使うデフォルト文言 */
  defaultContent: string;
  /** テンプレに含まれる `{{varname}}` のキー (admin UI で表示) */
  supportedVariables: readonly string[];
  /** プレビュー時のサンプル値 (admin UI で初期値として使用) */
  previewSamples?: Readonly<Record<string, string>>;
}

// ============================================================================
// Style 系 (One-Tap Style 画面で使用)
// ============================================================================

const STYLE_BASE_PREFIX_DEFAULT = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation within the Existing Frame (REQUIRED): You MUST replace the person's current clothing with the outfit described in the "Styling Direction" below. The replacement MUST appear only on body parts that are already visible in \`image_0.png\`. DO NOT extend the crop, widen the framing, or reveal additional body parts (legs, feet, lower body, etc.) that are not visible in the original image. The output image MUST visibly show the new outfit on the parts of the body that were already in frame. Returning the original outfit unchanged is a failure; extending the frame or adding body parts not in the original image is also a failure.

2. Pose & Identity Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`. Do not alter the person's identity.

3. Strict Framing: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a body part is not in the original frame, do not add it. Preserve the exact crop, camera angle, and composition of \`image_0.png\`.`;

// ============================================================================
// Coordinate 系 (buildPrompt の coordinate 分岐内テキスト)
// ============================================================================

const COORDINATE_BASE_PREFIX_DEFAULT = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation within the Existing Frame (REQUIRED): You MUST replace the person's current clothing with the outfit described under "New Outfit" below. The replacement MUST appear only on body parts that are already visible in \`image_0.png\`. DO NOT extend the crop, widen the framing, or reveal additional body parts (legs, feet, lower body, etc.) that are not visible in the original image. The output image MUST visibly show the new outfit on the parts of the body that were already in frame. Returning the original outfit unchanged is a failure; extending the frame or adding body parts not in the original image is also a failure.

2. Pose & Identity Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`. Do not alter the person's identity.

3. Strict Framing: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a body part is not in the original frame, do not add it. Preserve the exact crop, camera angle, and composition of \`image_0.png\`.`;

// ============================================================================
// Inspire 系 (buildInspirePrompt 内テキスト)
// ============================================================================

const INSPIRE_PREAMBLE_DEFAULT =
  "絶対に守ること：必ずimage_0のキャラクターの体型は完全に保持してください。";

// ============================================================================
// Reinforcement (リトライ強化 prefix)
// ============================================================================

const REINFORCEMENT_COORDINATE_DEFAULT = `RETRY NOTICE (attempt {{attempt}}): The previous generation failed to apply the requested transformation — the output was either unchanged, only partially modified, or did not reflect the New Outfit described below. You MUST strictly apply the outfit replacement on the body parts already visible in \`image_0.png\`, within the existing frame, and any background instruction below. Do not return the original image unchanged. Do not extend the crop, widen the framing, or add body parts (legs, feet, lower body) that were not visible in \`image_0.png\`.

`;

const REINFORCEMENT_STYLE_DEFAULT = `RETRY NOTICE (attempt {{attempt}}): The previous generation failed to apply the requested transformation — the output was either unchanged, only partially modified, or did not reflect the Styling Direction. You MUST strictly apply the outfit replacement on the body parts already visible in \`image_0.png\`, within the existing frame, and any background instruction below. Do not return the original image unchanged. Do not extend the crop, widen the framing, or add body parts (legs, feet, lower body) that were not visible in \`image_0.png\`.

`;

// ============================================================================
// レジストリ本体
// ============================================================================

export const PROMPT_REGISTRY = {
  // ── Style ──────────────────────────────────────────────────────────────
  "style.base_prefix": {
    category: "style",
    description: "Style 画面共通の CRITICAL INSTRUCTION 前文 (3 ステップ)",
    defaultContent: STYLE_BASE_PREFIX_DEFAULT,
    supportedVariables: [],
  },
  "style.illustration_suffix": {
    category: "style",
    description: "Style: イラスト入力の場合のスタイル指示",
    defaultContent:
      "Maintain the exact artistic style, brushwork, and original composition.",
    supportedVariables: [],
  },
  "style.real_suffix": {
    category: "style",
    description: "Style: 実写入力の場合のスタイル指示",
    defaultContent:
      "Generate a photorealistic result based on the uploaded photo. Preserve the original camera angle, framing, realistic lighting, and composition. Do not introduce painterly or illustrated rendering.",
    supportedVariables: [],
  },
  "style.keep_background_suffix": {
    category: "style",
    description: "Style: 背景維持時の指示",
    defaultContent:
      "Keep the entire original background unchanged as much as possible. Do not replace, redesign, or restyle the background.",
    supportedVariables: [],
  },
  "style.change_background_suffix": {
    category: "style",
    description: "Style: 背景変更時の指示",
    defaultContent:
      'You MUST restyle the background within the existing framing so that it matches the "Background Direction" below and complements the selected outfit. Replace or redesign the original background accordingly. Preserve the camera angle, crop, composition, pose, facial features, and character identity.',
    supportedVariables: [],
  },

  // ── Coordinate (通常コーディネート) ─────────────────────────────────────
  "coordinate.base_prefix": {
    category: "coordinate",
    description: "Coordinate: 通常生成の CRITICAL INSTRUCTION 前文 (3 ステップ)",
    defaultContent: COORDINATE_BASE_PREFIX_DEFAULT,
    supportedVariables: [],
  },
  "coordinate.real_style_suffix": {
    category: "coordinate",
    description: "Coordinate: 実写入力の場合のスタイル指示",
    defaultContent:
      "Generate a photorealistic result based on the uploaded photo. Captured with an 85mm portrait lens. Preserve the original camera angle, framing, realistic lighting, and composition. Do not introduce painterly or illustrated rendering.",
    supportedVariables: [],
  },
  "coordinate.illustration_style_suffix": {
    category: "coordinate",
    description: "Coordinate: イラスト入力の場合のスタイル指示",
    defaultContent:
      "Maintain the exact illustration touch and artistic style of the uploaded image. Preserve the original camera angle, framing, pose, and composition.",
    supportedVariables: [],
  },
  "coordinate.keep_background_suffix": {
    category: "coordinate",
    description: "Coordinate: 背景維持時の指示",
    defaultContent:
      "Keep the entire original background unchanged as much as possible. Do not replace, redesign, or restyle the background.",
    supportedVariables: [],
  },
  "coordinate.change_background_suffix": {
    category: "coordinate",
    description: "Coordinate: 背景変更 (ai_auto) 時の指示",
    defaultContent:
      "You MUST restyle the background within the existing framing so that it complements the new outfit's style and color palette. Replace or redesign the original background accordingly. Preserve the camera angle, crop, composition, pose, facial features, and character identity.",
    supportedVariables: [],
  },

  // ── Coordinate (specified_coordinate / full_body / chibi の全文テンプレート) ──
  // これらの 3 ジェネレーションタイプは background_mode (keep / ai_auto / include_in_prompt) ごとに
  // 異なる多文段テンプレートを返す。各テンプレートは {{description}} を含む。
  "coordinate.specified_keep_template": {
    category: "coordinate",
    description: "Specified Coordinate: 背景維持時のフル本文 ({{description}} を含む)",
    defaultContent: `Edit **only the outfit** of the person in the image to match the provided clothing image.

**New Outfit:**

{{description}}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いシャツとデニムのカジュアルコーデ" },
  },
  "coordinate.specified_ai_auto_template": {
    category: "coordinate",
    description: "Specified Coordinate: 背景変更 (ai_auto) 時のフル本文",
    defaultContent: `Edit **only the outfit** of the person in the image to match the provided clothing image, and **generate a new background that complements the new look**.

**New Outfit:**

{{description}}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Make sure the updated background still feels cohesive with the character and shares the same illustration style as the original.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いシャツとデニムのカジュアルコーデ" },
  },
  "coordinate.specified_include_in_prompt_template": {
    category: "coordinate",
    description: "Specified Coordinate: ユーザー記述に背景を委ねる場合",
    defaultContent: `Edit **the outfit** of the person in the image to match the provided clothing image.

**New Outfit:**

{{description}}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いシャツとデニムのカジュアルコーデ" },
  },
  "coordinate.full_body_keep_template": {
    category: "coordinate",
    description: "Full Body: 上半身→全身展開、背景維持",
    defaultContent: `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

{{description}}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いブラウスとロングスカート" },
  },
  "coordinate.full_body_ai_auto_template": {
    category: "coordinate",
    description: "Full Body: 上半身→全身、背景変更",
    defaultContent: `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

{{description}}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions. Generate a new background that complements the full-body composition.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いブラウスとロングスカート" },
  },
  "coordinate.full_body_include_in_prompt_template": {
    category: "coordinate",
    description: "Full Body: ユーザー記述に背景を委ねる場合",
    defaultContent: `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

{{description}}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いブラウスとロングスカート" },
  },
  "coordinate.chibi_keep_template": {
    category: "coordinate",
    description: "Chibi: 2頭身変形、背景維持",
    defaultContent: `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

{{description}}

Keep everything else consistent: face features, hair, pose, expression, the entire background, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いブラウスとロングスカート" },
  },
  "coordinate.chibi_ai_auto_template": {
    category: "coordinate",
    description: "Chibi: 2頭身変形、背景変更",
    defaultContent: `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

{{description}}

Keep everything else consistent: face features, hair, pose, expression, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features. Generate a new background that complements the chibi style.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いブラウスとロングスカート" },
  },
  "coordinate.chibi_include_in_prompt_template": {
    category: "coordinate",
    description: "Chibi: ユーザー記述に背景を委ねる場合",
    defaultContent: `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

{{description}}

Keep everything else consistent: face features, hair, pose, expression, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features.`,
    supportedVariables: ["description"],
    previewSamples: { description: "白いブラウスとロングスカート" },
  },

  // ── Inspire ─────────────────────────────────────────────────────────────
  "inspire.preamble": {
    category: "inspire",
    description: "Inspire: 全パターン共通の前文 (体型保持の絶対指示)",
    defaultContent: INSPIRE_PREAMBLE_DEFAULT,
    supportedVariables: [],
  },
  "inspire.outfit_on": {
    category: "inspire",
    description: "Inspire: outfit をテンプレ画像から適用する時の指示文",
    defaultContent: "image_1の服をimage_0に着せてください。",
    supportedVariables: [],
  },
  "inspire.outfit_off": {
    category: "inspire",
    description: "Inspire: outfit を維持する時の指示文",
    defaultContent: "image_0の衣装は変えないでください。",
    supportedVariables: [],
  },
  "inspire.angle_on": {
    category: "inspire",
    description: "Inspire: angle をテンプレ画像から適用する時の指示文",
    defaultContent: "image_1と同じカメラアングルをimage_0に適用してください。",
    supportedVariables: [],
  },
  "inspire.angle_off": {
    category: "inspire",
    description: "Inspire: angle を維持する時の指示文",
    defaultContent: "image_0のカメラアングルは変えないでください。",
    supportedVariables: [],
  },
  "inspire.pose_on": {
    category: "inspire",
    description: "Inspire: pose をテンプレ画像から適用する時の指示文",
    defaultContent:
      "image_1のポーズと似たようなポーズをimage_0に適用してください。",
    supportedVariables: [],
  },
  "inspire.pose_off": {
    category: "inspire",
    description: "Inspire: pose を維持する時の指示文",
    defaultContent: "image_0のポーズは変えないでください。",
    supportedVariables: [],
  },
  "inspire.background_on": {
    category: "inspire",
    description: "Inspire: background をテンプレ画像から適用する時の指示文",
    defaultContent:
      "image_1の背景と同じ背景をimage_0に適用してください。",
    supportedVariables: [],
  },
  "inspire.background_off": {
    category: "inspire",
    description: "Inspire: background を維持する時の指示文",
    defaultContent: "image_0の背景は変えないでください。",
    supportedVariables: [],
  },

  // ── Reinforcement (リトライ強化 prefix) ─────────────────────────────────
  "reinforcement.coordinate_attempt_2plus": {
    category: "reinforcement",
    description:
      "Coordinate 系のリトライ強化 prefix (attempt ≥ 2 で前置)。末尾の改行 2 つは生成プロンプトとの区切りで重要",
    defaultContent: REINFORCEMENT_COORDINATE_DEFAULT,
    supportedVariables: ["attempt"],
    previewSamples: { attempt: "2" },
  },
  "reinforcement.style_attempt_2plus": {
    category: "reinforcement",
    description: "Style 系のリトライ強化 prefix (attempt ≥ 2 で前置)",
    defaultContent: REINFORCEMENT_STYLE_DEFAULT,
    supportedVariables: ["attempt"],
    previewSamples: { attempt: "2" },
  },
} as const satisfies Record<string, PromptDefinition>;

// 型ヘルパ: registry のキー型
export type PromptKey = keyof typeof PROMPT_REGISTRY;

export const PROMPT_KEYS = Object.keys(PROMPT_REGISTRY) as PromptKey[];

/**
 * 指定 key の default content を取得する。registry に無ければ undefined。
 */
export function getDefaultPromptContent(
  key: string,
): string | undefined {
  if (key in PROMPT_REGISTRY) {
    return PROMPT_REGISTRY[key as PromptKey].defaultContent;
  }
  return undefined;
}

/**
 * registry に存在する key かを判定する (whitelist 用)。
 */
export function isKnownPromptKey(key: string): key is PromptKey {
  return key in PROMPT_REGISTRY;
}
