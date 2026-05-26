/**
 * テンプレート展開ヘルパ。
 *
 * `{{varname}}` プレースホルダーを `vars[varname]` で置換する。
 * `vars` に該当キーが無い場合は **そのまま残す** (silent 失敗を避け、運用者が
 * 生成ログで `{{unknownvar}}` を見つけられるようにするため)。
 *
 * Edge Function (Deno) / Next.js (Node) / client component の 3 ランタイムから
 * import 可能にするため、外部依存ゼロの pure TypeScript で実装する (ADR-007)。
 */

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * テンプレ文字列の `{{varname}}` を vars で置換した結果を返す。
 *
 * @example
 *   applyTemplate("Attempt {{attempt}} of {{max}}", { attempt: 2, max: 3 })
 *   // → "Attempt 2 of 3"
 *
 *   applyTemplate("Hello {{name}}, you have {{count}} items", { name: "Yu" })
 *   // → "Hello Yu, you have {{count}} items"   (count 未指定はそのまま残る)
 */
export function applyTemplate(text: string, vars: TemplateVars): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, varName: string) => {
    const value = vars[varName];
    if (value == null) return match;
    return String(value);
  });
}

/**
 * テンプレ文字列に含まれる `{{varname}}` のキー一覧を抽出する。
 * registry の `supportedVariables` 妥当性検証 / admin UI のヘルプ表示で使う。
 */
export function extractTemplateVariables(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_PATTERN.source, "g");
  while ((match = re.exec(text)) !== null) {
    found.add(match[1]!);
  }
  return Array.from(found);
}
