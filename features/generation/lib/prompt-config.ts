/**
 * プロンプトテンプレート設定
 * 各生成タイプごとに最適化されたプロンプトテンプレートを定義
 * 注意: outfitDescriptionは prompt-builder.ts でサニタイズ済みであることを前提としています
 */

export type GenerationType = 'coordinate' | 'specified_coordinate' | 'full_body' | 'chibi';

export interface PromptVariables {
  outfitDescription: string; // ユーザー入力（サニタイズ済み）
  backgroundDirective: string; // 背景変更の指示
}

export interface PromptConfig {
  prompt_template: (vars: PromptVariables) => string;
}

/**
 * プロンプトテンプレート設定マップ
 */
const PROMPT_CONFIGS: Record<GenerationType, PromptConfig> = {
  coordinate: {
    prompt_template: (vars: PromptVariables) => {
      const { outfitDescription, backgroundDirective } = vars;
      // outfitDescriptionは既にサニタイズ済み（prompt-builder.tsで処理済み）

      if (backgroundDirective.includes('Keep the original background')) {
        // 背景変更なし
        return `Maintain the exact illustration touch and artistic style of the uploaded image, and preserve its pose and composition exactly.
Do not change the camera angle or framing from the original image.
Edit only the outfit.

New Outfit:

${outfitDescription}`;
      } else {
        // 背景変更あり
        return `Maintain the exact illustration touch and artistic style of the uploaded image, and preserve its pose and composition exactly.
Do not change the camera angle or framing from the original image.
Adjust the background to match the new outfit’s style and color palette.

New Outfit:

${outfitDescription}`;
      }
    },
  },

  specified_coordinate: {
    prompt_template: (vars: PromptVariables) => {
      const { outfitDescription, backgroundDirective } = vars;
      // outfitDescriptionは既にサニタイズ済み（prompt-builder.tsで処理済み）

      // 指定コーディネート: 人物画像 + 服の画像（2枚入力）を組み合わせる
      // TODO: 将来的に実装時に詳細を調整
      if (backgroundDirective.includes('Keep the original background')) {
        return `Edit **only the outfit** of the person in the image to match the provided clothing image.

**New Outfit:**

${outfitDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style.`;
      } else {
        return `Edit **only the outfit** of the person in the image to match the provided clothing image, and **generate a new background that complements the new look**.

**New Outfit:**

${outfitDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Make sure the updated background still feels cohesive with the character and shares the same illustration style as the original.`;
      }
    },
  },

  full_body: {
    prompt_template: (vars: PromptVariables) => {
      const { outfitDescription, backgroundDirective } = vars;
      // outfitDescriptionは既にサニタイズ済み（prompt-builder.tsで処理済み）

      // 全身生成: 上半身のみから全身画像を生成
      // TODO: 将来的に実装時に詳細を調整
      if (backgroundDirective.includes('Keep the original background')) {
        return `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

${outfitDescription}

Keep everything else consistent: face, hair, pose, expression, the entire background, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions.`;
      } else {
        return `Generate a full-body image from the upper body image, maintaining the character's appearance and style.

**Outfit Description:**

${outfitDescription}

Keep everything else consistent: face, hair, pose, expression, lighting, and art style. Extend the image naturally to show the full body while maintaining proportions. Generate a new background that complements the full-body composition.`;
      }
    },
  },

  chibi: {
    prompt_template: (vars: PromptVariables) => {
      const { outfitDescription, backgroundDirective } = vars;
      // outfitDescriptionは既にサニタイズ済み（prompt-builder.tsで処理済み）

      // chibi生成: 人物画像から2頭身キャラクターを生成
      // TODO: 将来的に実装時に詳細を調整
      if (backgroundDirective.includes('Keep the original background')) {
        return `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

${outfitDescription}

Keep everything else consistent: face features, hair, pose, expression, the entire background, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features.`;
      } else {
        return `Transform the person in the image into a chibi-style character (2-head proportion) while maintaining their appearance and outfit.

**Outfit Description:**

${outfitDescription}

Keep everything else consistent: face features, hair, pose, expression, lighting, and art style. Apply chibi proportions (2-head ratio) while preserving the character's recognizable features. Generate a new background that complements the chibi style.`;
      }
    },
  },
};

/**
 * 生成タイプに対応するプロンプト設定を取得
 */
export function getPromptConfig(generationType: GenerationType): PromptConfig {
  const config = PROMPT_CONFIGS[generationType];
  
  if (!config) {
    throw new Error(
      `API Error - Configuration '${generationType}' not found. Available types: ${Object.keys(PROMPT_CONFIGS).join(', ')}`
    );
  }
  
  return config;
}

/**
 * 背景変更の指示文を生成
 */
export function getBackgroundDirective(shouldChangeBackground: boolean): string {
  return shouldChangeBackground
    ? "Adapt the background to match the new outfit's mood, setting, and styling, ensuring character lighting remains coherent."
    : "Keep the original background exactly as in the source image, editing only the outfit without altering the environment or lighting context.";
}
