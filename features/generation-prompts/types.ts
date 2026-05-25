/**
 * admin 編集可能な生成 prompt の型定義。
 *
 * - 完全な registry (key ごとの defaultContent / supportedVariables 等) は
 *   shared/generation/prompt-registry.ts (Phase 2 で作成) を真とする。
 * - 本ファイルでは「カテゴリ」「key の集合」「DB 行」「resolver の戻り値」
 *   といった runtime 非依存の型のみ定義する。
 *
 * 詳細: docs/planning/admin-generation-prompt-editor-plan.md
 */

/**
 * admin UI 上のカテゴリ。一覧画面でグループ表示する単位。
 *
 * - style: Style 画面 (One-Tap Style) で使われる prompt
 * - coordinate: 通常 / specified / full_body / chibi コーディネート
 * - inspire: Inspire テンプレ適用時の指示文 (keep_all + override 4 種)
 * - reinforcement: リトライ時の強化 prefix (coordinate / style 別)
 */
export const PROMPT_CATEGORIES = [
  "style",
  "coordinate",
  "inspire",
  "reinforcement",
] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

/**
 * prompt_key の命名規約: `<category>.<subkey>`
 *
 * 実 key は shared/generation/prompt-registry.ts の `PROMPT_REGISTRY` で列挙する。
 * registry を真とする (DB 側に CHECK 制約は持たない、運用側で whitelist 管理)。
 *
 * Phase 2 で registry を実装した後、registry のキー型から再エクスポートする想定。
 */
export type PromptKey = string;

/**
 * DB 行を表す type。`prompt_overrides` テーブルと 1:1。
 */
export interface PromptOverrideRow {
  prompt_key: string;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * resolver (Next.js / worker) の戻り値型。
 * registry の全 key を網羅した dict。欠落キーは registry default が入る。
 */
export type ResolvedPromptTemplates = Record<PromptKey, string>;
