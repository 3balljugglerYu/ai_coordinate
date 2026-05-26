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

  // 注: specified_coordinate / full_body / chibi の 9 key (3 generation_type × 3 mode) は
  // UI から外れて 30 日以上利用ゼロのため撤去。再導入する場合は git log から復元可能。

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
