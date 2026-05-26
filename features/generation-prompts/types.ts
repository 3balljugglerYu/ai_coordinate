/**
 * admin 編集可能な生成 prompt の型定義 (Next.js 側固有部分)。
 *
 * - 完全な registry (key 列挙 / defaultContent / supportedVariables 等) は
 *   `shared/generation/prompt-registry.ts` を真とする (pure layer)。
 * - 本ファイルでは Next.js 側で使う「DB 行」型のみを定義し、registry 由来の
 *   型は再 export するだけに留める (shared layer は features/ に依存しない設計)。
 *
 * 詳細: docs/planning/admin-generation-prompt-editor-plan.md
 */

// pure layer (shared/) から再 export。Next.js 側のコードは原則本ファイル経由で参照する
export {
  PROMPT_CATEGORIES,
  PROMPT_KEYS,
  PROMPT_REGISTRY,
  type PromptCategory,
  type PromptDefinition,
  type PromptKey,
} from "@/shared/generation/prompt-registry";

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
export type ResolvedPromptTemplates = Record<string, string>;
