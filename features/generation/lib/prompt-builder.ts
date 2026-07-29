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
  SourceImageType,
} from "@/shared/generation/prompt-core";

export interface BuildPromptOptions {
  generationType: GenerationType;
  outfitDescription: string; // ユーザー入力（日本語のまま）
  backgroundMode: BackgroundMode;
  sourceImageType?: SourceImageType;
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
  // 最終プロンプトは運営が管理する錨(free.base_prefix 等)とユーザー入力の
  // 結合結果であり、いずれも秘匿対象。ログ・APM・プロバイダのエラー
  // ペイロードへ書き出さない (REQ-017)。
  //
  // 生成種別・背景モード等の非秘匿な識別子だけであればログしてよいが、
  // 本文と同じ行に出すと切り分けを誤って再び全文が載るため、この関数では
  // 何も出力しない方針に統一する。
  return buildPromptCore(options);
}
