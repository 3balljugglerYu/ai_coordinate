/**
 * プロンプト構築関数
 * 生成タイプとユーザー入力から最適化されたプロンプトを構築
 */

import {
  buildPrompt as buildPromptCore,
  sanitizeUserInput as sanitizeUserInputCore,
} from "@/shared/generation/prompt-core";
import type {
  BackgroundMode,
  GenerationType,
} from "@/shared/generation/prompt-core";

export interface BuildPromptOptions {
  generationType: GenerationType;
  outfitDescription: string; // ユーザー入力（日本語のまま）
  backgroundMode: BackgroundMode;
}

/**
 * プロンプトインジェクション対策: ユーザー入力をサニタイズ
 * - 制御文字の除去
 * - 複数の連続改行を統一（最大2つの連続改行まで許可）
 * - 禁止語句パターンの検出（基本的なインジェクション試行を防ぐ）
 */
export function sanitizeUserInput(input: string): string {
  return sanitizeUserInputCore(input);
}

/**
 * プロンプトを構築（プロンプトインジェクション対策済み）
 */
export function buildPrompt(options: BuildPromptOptions): string {
  const prompt = buildPromptCore(options);

  // デバッグ用: 最終プロンプトをログ出力
  console.log(`[Prompt Builder] Generation Type: ${options.generationType}`);
  console.log(`[Prompt Builder] Background Mode: ${options.backgroundMode}`);
  console.log(`[Prompt Builder] Final Prompt:\n${prompt}`);

  return prompt;
}
