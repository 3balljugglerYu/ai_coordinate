/**
 * /style (One-Tap Style) 用のプロンプト生成・リトライ強化ヘルパー。
 * Next.js API route (sync) と Supabase Edge Function worker (async) の両方から利用する。
 *
 * 同期 path はリクエストごとにフルプロンプトを組み立てて Gemini に投げる。
 * 非同期 path は生成時にフルプロンプトを組み立てて image_jobs.prompt_text に保存し、
 * worker はそれをそのまま使うため、本モジュールは worker 側でもそのまま import できるよう
 * Deno と Node の両方で動く pure TypeScript で書く。
 */

import type { SourceImageType } from "./prompt-core.ts";

export const STYLE_PROMPT_BASE_PREFIX = `CRITICAL INSTRUCTION: This is an Image-to-Image task based on \`image_0.png\`. You MUST follow these steps exactly:

1. Outfit Transformation within the Existing Frame (REQUIRED): You MUST replace the person's current clothing with the outfit described in the "Styling Direction" below. The replacement MUST appear only on body parts that are already visible in \`image_0.png\`. DO NOT extend the crop, widen the framing, or reveal additional body parts (legs, feet, lower body, etc.) that are not visible in the original image. The output image MUST visibly show the new outfit on the parts of the body that were already in frame. Returning the original outfit unchanged is a failure; extending the frame or adding body parts not in the original image is also a failure.

2. Pose & Identity Preservation: Maintain the exact facial features, hair style, and pose of the person in \`image_0.png\`. Do not alter the person's identity.

3. Strict Framing: DO NOT describe or generate any body parts, clothing, or items that are not visible in \`image_0.png\`. If a body part is not in the original frame, do not add it. Preserve the exact crop, camera angle, and composition of \`image_0.png\`.`;

export const STYLE_PROMPT_ILLUSTRATION_SUFFIX =
  "Maintain the exact artistic style, brushwork, and original composition.";

export const STYLE_PROMPT_REAL_SUFFIX =
  "Generate a photorealistic result based on the uploaded photo. Preserve the original camera angle, framing, realistic lighting, and composition. Do not introduce painterly or illustrated rendering.";

export const STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX =
  "Keep the entire original background unchanged as much as possible. Do not replace, redesign, or restyle the background.";

export const STYLE_PROMPT_CHANGE_BACKGROUND_SUFFIX =
  "You MUST restyle the background within the existing framing so that it matches the \"Background Direction\" below and complements the selected outfit. Replace or redesign the original background accordingly. Preserve the camera angle, crop, composition, pose, facial features, and character identity.";

export interface BuildStyleGenerationPromptParams {
  stylingPrompt: string;
  backgroundPrompt: string | null;
  backgroundChange: boolean;
  sourceImageType: SourceImageType;
}

export function buildStyleGenerationPrompt(
  params: BuildStyleGenerationPromptParams
): string {
  const promptSuffix =
    params.sourceImageType === "real"
      ? STYLE_PROMPT_REAL_SUFFIX
      : STYLE_PROMPT_ILLUSTRATION_SUFFIX;
  const backgroundInstruction = params.backgroundChange
    ? STYLE_PROMPT_CHANGE_BACKGROUND_SUFFIX
    : STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX;

  const promptSections = [
    STYLE_PROMPT_BASE_PREFIX,
    promptSuffix,
    backgroundInstruction,
    `Styling Direction:\n${params.stylingPrompt}`,
  ];

  if (params.backgroundChange && params.backgroundPrompt) {
    promptSections.push(`Background Direction:\n${params.backgroundPrompt}`);
  }

  return promptSections.join("\n\n");
}

/**
 * リトライ時に先頭へ差し込む強化プロンプト。
 * attempt=1 は空文字を返し、attempt>=2 で Gemini に「前回は変化しなかった／不十分だった」旨を
 * 明示する文言を返す。呼び出し側はこの戻り値を既存プロンプトの先頭に結合する想定。
 */
export function buildStyleAttemptReinforcementPrefix(attempt: number): string {
  if (attempt <= 1) {
    return "";
  }
  return `RETRY NOTICE (attempt ${attempt}): The previous generation failed to apply the requested transformation — the output was either unchanged, only partially modified, or did not reflect the Styling Direction. You MUST strictly apply the outfit replacement on the body parts already visible in \`image_0.png\`, within the existing frame, and any background instruction below. Do not return the original image unchanged. Do not extend the crop, widen the framing, or add body parts (legs, feet, lower body) that were not visible in \`image_0.png\`.\n\n`;
}
