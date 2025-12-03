/**
 * プロンプト構築関数
 * 生成タイプとユーザー入力から最適化されたプロンプトを構築
 */

import { getPromptConfig, getBackgroundDirective, type GenerationType, type PromptVariables } from './prompt-config';

export interface BuildPromptOptions {
  generationType: GenerationType;
  outfitDescription: string; // ユーザー入力（日本語のまま）
  shouldChangeBackground: boolean;
}

/**
 * プロンプトを構築
 */
export function buildPrompt(options: BuildPromptOptions): string {
  const { generationType, outfitDescription, shouldChangeBackground } = options;

  // 設定を取得
  const config = getPromptConfig(generationType);

  // 背景変更の指示文を生成
  const backgroundDirective = getBackgroundDirective(shouldChangeBackground);

  // プロンプト変数を準備
  const promptVariables: PromptVariables = {
    outfitDescription,
    backgroundDirective,
  };

  // プロンプトテンプレートを実行
  if (typeof config.prompt_template === 'function') {
    const prompt = config.prompt_template(promptVariables);
    
    // デバッグ用: 最終プロンプトをログ出力
    console.log(`[Prompt Builder] Generation Type: ${generationType}`);
    console.log(`[Prompt Builder] Background Change: ${shouldChangeBackground}`);
    console.log(`[Prompt Builder] Final Prompt:\n${prompt}`);
    
    return prompt;
  }

  throw new Error(
    `API Error - Prompt template for '${generationType}' is not a function`
  );
}

