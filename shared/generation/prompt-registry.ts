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
  "creator_looks",
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

// free_pose モード (framing_mode="free_pose") 用の前文。
// identity (顔・髪型・体型・画風) は厳守しつつ、ポーズ・カメラアングル・構図は
// Styling Direction / ユーザー指示を優先する。locked 用と異なり style suffix
// (illustration/real) は併用しない (画風維持の指示を本文 2. に内包しているため)。
const STYLE_BASE_PREFIX_FREE_POSE_DEFAULT = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation (REQUIRED): You MUST replace the person's current clothing with the outfit described in the "Styling Direction" below. The output image MUST visibly show the new outfit. Returning the original outfit unchanged is a failure.

2. Identity Preservation (REQUIRED): Keep the person in \`image_0.png\` recognizable as the exact same character: preserve the facial features, hairstyle, hair color, eye color, body shape, skin tone, and overall appearance. Also preserve the rendering style of \`image_0.png\` — if it is a photograph, keep the output photorealistic; if it is an illustration, keep the same artistic touch and brushwork. Do not alter the person's identity.

3. Flexible Pose & Framing: You MAY change the pose, camera angle, framing, crop, and composition. If the "Styling Direction" or the user's instructions below specify a pose, camera angle, or composition, follow them with priority. If they do not, choose a natural pose and framing that best presents the outfit. You may render body parts that were not visible in \`image_0.png\`, as long as they stay consistent with the character's identity and body shape.`;

// ============================================================================
// Coordinate 系 (buildPrompt の coordinate 分岐内テキスト)
// ============================================================================

const COORDINATE_BASE_PREFIX_DEFAULT = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation within the Existing Frame (REQUIRED): You MUST replace the person's current clothing with the outfit described under "New Outfit" below. The replacement MUST appear only on body parts that are already visible in \`image_0.png\`. DO NOT extend the crop, widen the framing, or reveal additional body parts (legs, feet, lower body, etc.) that are not visible in the original image. The output image MUST visibly show the new outfit on the parts of the body that were already in frame. Returning the original outfit unchanged is a failure; extending the frame or adding body parts not in the original image is also a failure.

2. Pose & Identity Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`. Do not alter the person's identity.

3. Strict Framing: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a body part is not in the original frame, do not add it. Preserve the exact crop, camera angle, and composition of \`image_0.png\`.`;

// free_pose モード用 (STYLE_BASE_PREFIX_FREE_POSE_DEFAULT のコメント参照)。
const COORDINATE_BASE_PREFIX_FREE_POSE_DEFAULT = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation (REQUIRED): You MUST replace the person's current clothing with the outfit described under "New Outfit" below. The output image MUST visibly show the new outfit. Returning the original outfit unchanged is a failure.

2. Identity Preservation (REQUIRED): Keep the person in \`image_0.png\` recognizable as the exact same character: preserve the facial features, hairstyle, hair color, eye color, body shape, skin tone, and overall appearance. Also preserve the rendering style of \`image_0.png\` — if it is a photograph, keep the output photorealistic; if it is an illustration, keep the same artistic touch and brushwork. Do not alter the person's identity.

3. Flexible Pose & Framing: You MAY change the pose, camera angle, framing, crop, and composition. If the "New Outfit" description or the user's instructions below specify a pose, camera angle, or composition, follow them with priority. If they do not, choose a natural pose and framing that best presents the outfit. You may render body parts that were not visible in \`image_0.png\`, as long as they stay consistent with the character's identity and body shape.`;

// pose_only モード用 (free_pose かつ衣装指示が空)。服は維持し、ポーズ・カメラのみ変更する。
const COORDINATE_POSE_ONLY_PREFIX_DEFAULT = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Keep the Outfit (REQUIRED): Keep the person's current clothing and outfit from \`image_0.png\` EXACTLY as-is. Do NOT change, replace, recolor, or restyle the clothing. Reproduce the same outfit faithfully.

2. Identity Preservation (REQUIRED): Keep the person in \`image_0.png\` recognizable as the exact same character: preserve the facial features, hairstyle, hair color, eye color, body shape, skin tone, and overall appearance. Also preserve the rendering style of \`image_0.png\` — if it is a photograph, keep the output photorealistic; if it is an illustration, keep the same artistic touch and brushwork.

3. Change Pose as Directed: Change the character's pose, gesture, and facial expression to match the "Pose & Camera Direction" below. By DEFAULT, KEEP the camera angle, framing, crop, and overall composition of \`image_0.png\` unchanged — do NOT move or rotate the camera, and do NOT re-crop or re-frame, UNLESS the direction explicitly asks for a camera/angle/framing change (for example "low angle", "close-up", "from above", "full body"). You may render body parts needed for the new pose, as long as they stay consistent with the character's identity, body shape, and the same outfit.`;

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

// free_pose モード用のリトライ強化 prefix。locked 用と異なりフレーム固定を再強制しない
// (再強制すると base_prefix_free_pose の Flexible Pose & Framing と矛盾するため)。
const REINFORCEMENT_COORDINATE_FREE_POSE_DEFAULT = `RETRY NOTICE (attempt {{attempt}}): The previous generation failed to apply the requested transformation — the output was either unchanged, only partially modified, or did not reflect the New Outfit described below. You MUST strictly apply the outfit replacement while keeping the character identity (face, hairstyle, body shape, rendering style) of \`image_0.png\`. The pose, camera angle, and framing are allowed to change as instructed below. Do not return the original image unchanged.

`;

const REINFORCEMENT_STYLE_FREE_POSE_DEFAULT = `RETRY NOTICE (attempt {{attempt}}): The previous generation failed to apply the requested transformation — the output was either unchanged, only partially modified, or did not reflect the Styling Direction. You MUST strictly apply the outfit replacement while keeping the character identity (face, hairstyle, body shape, rendering style) of \`image_0.png\`. The pose, camera angle, and framing are allowed to change as instructed below. Do not return the original image unchanged.

`;

// ============================================================================
// Creator Looks 系 (= 投稿時に VLM で衣装プロンプトを抽出する meta-prompt)
//
// このテンプレートは Persta の moat であり、admin が `/admin/generation-prompts` から
// 編集できる。runtime は `creator_looks.meta_extractor` キーを resolver で取得し、
// 投稿された画像と一緒に gpt-5.5 Responses API に送る。
//
// 出力 (= hidden_prompt) は `user_style_template_secrets` に保存され、
// 通常ユーザー (= クリエイター本人含む) からは一切見えない。
//
// 設計判断: docs/planning/creator-looks-implementation-plan.md ADR-005, ADR-010
// ============================================================================

const CREATOR_LOOKS_META_EXTRACTOR_DEFAULT = `# Role

You are an expert in outfit analysis and Image-to-Image prompt writing for Gemini 3 Flash Image / Nano Banana 2.

Analyze the attached outfit reference image and create a concise English prompt for transforming the outfit in \`image_0.png\`.

---

# Input Roles

- Attached outfit reference image:
  Use only as the source of outfit design, colors, materials, and visible accessories.

- \`image_0.png\`:
  This is the base image to edit.
  Preserve its character identity, face, hairstyle, pose, framing, crop, composition, and art style.

Do not extract the reference image's face, hairstyle, body identity, pose, or personal traits.

---

# Rules

1. Change only the visible outfit and visible accessories.
2. Preserve the exact face, hairstyle, body shape, pose, hand positions, camera angle, crop, framing, composition, and art style of \`image_0.png\`.
3. Describe only clothing and accessories that can appear within the visible frame of \`image_0.png\`.
4. If a body area is not visible in \`image_0.png\`, omit that section entirely.
5. Only for the Lower Body, Feet/Legs, and Accessories sections, output the placeholder text [Include ONLY if visible in image_0.png. Otherwise, omit this section.] immediately before the corresponding placeholder text.
6. If there is no hat or headwear, write: \`no hat, no headwear\`.
7. If there is no handheld item, write: \`None, hands are empty.\`
8. Use specific color names, concrete clothing terms, and concise fashion descriptions.
9. Avoid unsafe or fetish-like wording such as \`bound\`, \`binding\`, \`wrapped around\`, \`knots\`, \`fetish\`, or \`Lolita\`.
10. Instead of preserving the original background, briefly describe a background setting that best matches the mood, world, and style of the analyzed outfit.

---

# Output Rules

- Output only the final English prompt.
- Put everything in one code block.
- Keep the final prompt concise.

---

# Final Prompt Format

CRITICAL INSTRUCTION:
This is an Image-to-Image outfit transformation task based on \`image_0.png\`.

Preserve:
Maintain the exact character identity, face, hairstyle, body shape, pose, hand positions, camera angle, crop, framing, composition, and art style of \`image_0.png\`.

Edit:
Replace only the visible clothing and visible accessories.
Do not add body parts, change the pose, or alter the character identity.

Styling Direction:
Head: ...
Upper Body: ...
Lower Body: [Include ONLY if visible in image_0.png. Otherwise, omit this section.]...
Feet/Legs: [Include ONLY if visible in image_0.png. Otherwise, omit this section.]...
Accessories: [Include ONLY if visible in image_0.png. Otherwise, omit this section.]
  • Head/Hair: ...
  • Ears: ...
  • Neck: ...
  • Wrists/Hands: ...
  • Handheld Item & Arm Pose: ...
  • Others: ...

Background: ...

Constraints:
No extra limbs.
No extra fingers.
No added body parts outside the original frame.
No pose change.
No identity change.
No art style change.`;

// Creator Looks: 生成時に hidden_prompt 冒頭へ前置するカメラ/構図固定の最優先ルール。
// image_1(参照画像)を視覚的に渡すと構図・背景までコピーされる問題への対策。
const CREATOR_LOOKS_CAMERA_DIRECTIVE_DEFAULT = `TOP PRIORITY RULE — image_1 is an OUTFIT-ONLY reference:
Copy ONLY the outfit, garments, and accessories from image_1. You MUST completely ignore image_1's background, scenery, camera angle, perspective, pose, framing, and composition — never reproduce any of them. Keep image_0's exact camera angle, viewpoint, framing, crop, and pose unchanged. The background follows the separate background instruction; never copy the background or layout from image_1. Whenever anything other than the outfit conflicts between the two images, image_0 always wins.`;

// Creator Looks: 2段階生成の段階2(背景変更)/背景のみモードで使う背景プロンプト。
// image_1 を渡さずテキストのみで背景を生成するため、image_0 の画風に合わせる指示を強く持たせる。
// {background} に hidden_prompt から抽出した背景の世界観テキストが差し込まれる。
const CREATOR_LOOKS_BACKGROUND_DIRECTIVE_DEFAULT = `Change ONLY the background of image_0.png. Keep the character, face, hairstyle, body, outfit, accessories, pose, hand positions, camera angle, viewpoint, framing, crop, and art style of image_0.png exactly unchanged.

BACKGROUND STYLE — MOST IMPORTANT:
Draw the new background in the EXACT same illustration style as image_0.png — same linework, shading method, color treatment, texture, brushwork, level of detail, and overall finish. It must look as if the same artist painted the background as part of the original illustration. Do NOT render the background in a photorealistic style or any art style different from image_0.png.

Background: {{background}}

Redraw the background from image_0's own viewpoint so it fits the existing pose and framing. Do not add or remove any subject. Do not change the clothing.`;

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
  "style.base_prefix_free_pose": {
    category: "style",
    description:
      "Style: free_pose モード (ポーズ・アングル自由化) の CRITICAL INSTRUCTION 前文。" +
      "identity と画風維持を内包するため illustration/real suffix は併用しない",
    defaultContent: STYLE_BASE_PREFIX_FREE_POSE_DEFAULT,
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
  "style.keep_background_suffix_free_pose": {
    category: "style",
    description:
      "Style: free_pose モードの背景維持指示 (アングルが変わっても同じ環境を新視点で描く)",
    defaultContent:
      "Keep the background environment, location, and overall mood consistent with `image_0.png`. If the pose or camera angle changes, depict the same environment from the new viewpoint instead of replacing it with a different location.",
    supportedVariables: [],
  },
  "style.change_background_suffix_free_pose": {
    category: "style",
    description: "Style: free_pose モードの背景変更指示 (フレーミング固定を課さない)",
    defaultContent:
      'You MUST restyle the background so that it matches the "Background Direction" below and complements the selected outfit. The background composition may be designed freely to suit the new pose, camera angle, and framing. Preserve the character identity.',
    supportedVariables: [],
  },

  // ── Coordinate (通常コーディネート) ─────────────────────────────────────
  "coordinate.base_prefix": {
    category: "coordinate",
    description: "Coordinate: 通常生成の CRITICAL INSTRUCTION 前文 (3 ステップ)",
    defaultContent: COORDINATE_BASE_PREFIX_DEFAULT,
    supportedVariables: [],
  },
  "coordinate.base_prefix_free_pose": {
    category: "coordinate",
    description:
      "Coordinate: free_pose モード (ポーズ・アングル自由化) の CRITICAL INSTRUCTION 前文。" +
      "identity と画風維持を内包するため real/illustration style suffix は併用しない",
    defaultContent: COORDINATE_BASE_PREFIX_FREE_POSE_DEFAULT,
    supportedVariables: [],
  },
  "coordinate.pose_only_prefix": {
    category: "coordinate",
    description:
      "Coordinate: pose_only モード (free_pose かつ衣装指示が空) の前文。" +
      "服は維持し、ポーズ・カメラのみ変更する。style suffix は併用しない",
    defaultContent: COORDINATE_POSE_ONLY_PREFIX_DEFAULT,
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
  "coordinate.keep_background_suffix_free_pose": {
    category: "coordinate",
    description:
      "Coordinate: free_pose モードの背景維持指示 (アングルが変わっても同じ環境を新視点で描く)",
    defaultContent:
      "Keep the background environment, location, and overall mood consistent with `image_0.png`. If the pose or camera angle changes, depict the same environment from the new viewpoint instead of replacing it with a different location.",
    supportedVariables: [],
  },
  "coordinate.change_background_suffix_free_pose": {
    category: "coordinate",
    description:
      "Coordinate: free_pose モードの背景変更 (ai_auto) 指示 (フレーミング固定を課さない)",
    defaultContent:
      "You MUST restyle the background so that it complements the new outfit's style and color palette. The background composition may be designed freely to suit the new pose, camera angle, and framing. Preserve the character identity.",
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
  "reinforcement.coordinate_attempt_2plus_free_pose": {
    category: "reinforcement",
    description:
      "Coordinate 系 free_pose モードのリトライ強化 prefix (attempt ≥ 2 で前置)。" +
      "フレーム固定を再強制しない。末尾の改行 2 つは生成プロンプトとの区切りで重要",
    defaultContent: REINFORCEMENT_COORDINATE_FREE_POSE_DEFAULT,
    supportedVariables: ["attempt"],
    previewSamples: { attempt: "2" },
  },
  "reinforcement.style_attempt_2plus_free_pose": {
    category: "reinforcement",
    description:
      "Style 系 free_pose モードのリトライ強化 prefix (attempt ≥ 2 で前置)。フレーム固定を再強制しない",
    defaultContent: REINFORCEMENT_STYLE_FREE_POSE_DEFAULT,
    supportedVariables: ["attempt"],
    previewSamples: { attempt: "2" },
  },

  // ── Creator Looks ──────────────────────────────────────────────────────────
  "creator_looks.meta_extractor": {
    category: "creator_looks",
    description:
      "Creator Looks: クリエイター投稿画像から衣装+背景プロンプトを抽出する meta-prompt (VLM 入力)。" +
      "出力は user_style_template_secrets に保存され、通常ユーザーには公開しない。",
    defaultContent: CREATOR_LOOKS_META_EXTRACTOR_DEFAULT,
    supportedVariables: [],
  },
  "creator_looks.camera_directive": {
    category: "creator_looks",
    description:
      "Creator Looks: 生成時に hidden_prompt 冒頭へ前置する最優先ルール。" +
      "image_1 を「衣装専用の参照」に限定し、背景・構図・カメラアングルは image_0 を維持させる" +
      "(image_1 の構図がコピーされる問題への対策)。背景 ON/OFF どちらでも前置される。",
    defaultContent: CREATOR_LOOKS_CAMERA_DIRECTIVE_DEFAULT,
    supportedVariables: [],
  },
  "creator_looks.background_directive": {
    category: "creator_looks",
    description:
      "Creator Looks: 2段階生成の段階2(背景変更)/背景のみモードで使う背景プロンプト。" +
      "image_1 を渡さずテキストのみで背景を生成するため、image_0 の画風に合わせる指示を強く持つ。" +
      "{{background}} に hidden_prompt から抽出した背景の世界観テキストが差し込まれる。",
    defaultContent: CREATOR_LOOKS_BACKGROUND_DIRECTIVE_DEFAULT,
    supportedVariables: ["background"],
    previewSamples: { background: "spring cherry blossom park with soft sunlight" },
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
