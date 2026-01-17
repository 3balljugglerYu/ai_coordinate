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
 * プロンプトインジェクション対策: ユーザー入力をサニタイズ
 * - 制御文字の除去
 * - 複数の連続改行を統一（最大2つの連続改行まで許可）
 * - 禁止語句パターンの検出（基本的なインジェクション試行を防ぐ）
 */
export function sanitizeUserInput(input: string): string {
  // トリム
  let sanitized = input.trim();
  
  // 制御文字を除去（タブ、改行以外の制御文字）
  // タブはスペースに変換、改行は後で処理
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // 複数の連続改行を最大2つまでに制限（3つ以上は2つに統一）
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
  
  // 禁止語句パターンの検出（基本的なプロンプトインジェクション試行）
  // 注意: より厳密な検出が必要な場合は、より詳細なパターンマッチングを追加
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
      // 禁止パターンが検出された場合は、その部分を除去
      sanitized = sanitized.replace(pattern, '');
    }
  }
  
  // 再度トリム（禁止パターン除去後の余分な空白を削除）
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * プロンプトを構築（プロンプトインジェクション対策済み）
 */
export function buildPrompt(options: BuildPromptOptions): string {
  const { generationType, outfitDescription, shouldChangeBackground } = options;

  // ユーザー入力をサニタイズ
  const sanitizedDescription = sanitizeUserInput(outfitDescription);
  
  // サニタイズ後の入力が空の場合は、エラーを投げる
  if (!sanitizedDescription || sanitizedDescription.length === 0) {
    throw new Error("Invalid outfit description: empty or contains only prohibited content");
  }

  // 設定を取得
  const config = getPromptConfig(generationType);

  // 背景変更の指示文を生成
  const backgroundDirective = getBackgroundDirective(shouldChangeBackground);

  // プロンプト変数を準備（サニタイズ済みの説明文を使用）
  const promptVariables: PromptVariables = {
    outfitDescription: sanitizedDescription,
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

