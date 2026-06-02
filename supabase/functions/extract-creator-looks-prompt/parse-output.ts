// ===============================================
// Creator Looks: gpt-5.5 Responses API レスポンスのパーサ (pure helper)
// ===============================================
// Edge Function 本体から分離して Jest からテストできるようにする。
// Deno-only import は使わない。
//
// 設計:
//   - Responses API はモデルによってレスポンス形状が微妙に異なるため、
//     output[].content[].text の最初の output_text を採用する fallback ロジックを実装
//   - 出力が code block (= ```...```) でラップされている場合は中身を取り出す
//   - 空 / 不正な場合は null を返し、呼出側で失敗扱いにする
//
// 設計判断: docs/planning/creator-looks-implementation-plan.md REQ-003

/**
 * Responses API のレスポンス本体から、抽出された outfit プロンプトを取り出す。
 *
 * 期待する形状:
 *   {
 *     output: [
 *       { type: "message", content: [{ type: "output_text", text: "..." }] }
 *     ]
 *   }
 *
 * 古い形状や互換用に output_text を直接持つケースも吸収する。
 */
export function extractResponsesApiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  // 形状 1: output_text サマリーが直接生えているケース (= 一部 SDK / モデル)
  if (typeof obj.output_text === "string" && obj.output_text.length > 0) {
    return obj.output_text;
  }

  // 形状 2: output[] 配列の中から output_text content を探す
  const output = obj.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemObj = item as Record<string, unknown>;
    const content = itemObj.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const cObj = c as Record<string, unknown>;
      if (
        (cObj.type === "output_text" || cObj.type === "text") &&
        typeof cObj.text === "string" &&
        cObj.text.length > 0
      ) {
        return cObj.text;
      }
    }
  }

  return null;
}

/**
 * Code block でラップされている場合に中身を取り出す。
 *
 * 例:
 *   "```\nCRITICAL INSTRUCTION:\n...\n```"
 *   → "CRITICAL INSTRUCTION:\n..."
 *
 *   "```text\nfoo\n```"
 *   → "foo"
 *
 * ラップされていなければそのまま返す。trim も実施。
 */
export function unwrapCodeBlock(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  // 先頭 ``` 行を取り除く (= 言語指定があれば含めて 1 行)
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) return "";
  const afterOpening = trimmed.slice(firstNewline + 1);

  // 末尾 ``` を取り除く
  const closingIndex = afterOpening.lastIndexOf("```");
  if (closingIndex === -1) {
    // 閉じが無い場合は開きだけ取り除いて trim
    return afterOpening.trim();
  }

  return afterOpening.slice(0, closingIndex).trim();
}

/**
 * Responses API レスポンス全体 → 整形済み hidden_prompt 文字列 (= 即 DB 保存可能形式)
 *
 * 失敗時 (= 空 / null / 構造不正) は null を返す。
 */
export function parseExtractedPrompt(payload: unknown): string | null {
  const text = extractResponsesApiText(payload);
  if (!text) return null;
  const unwrapped = unwrapCodeBlock(text);
  if (!unwrapped) return null;
  return unwrapped;
}

/**
 * 簡易バリデーション: 抽出結果が「Creator Looks の meta-prompt 出力フォーマット」っぽいかチェック。
 * 真に厳密な検証ではない (= モデルが暴れた時の軽い detect 用)。
 *
 * 必須に近い構成: "Styling Direction" / "Background" の 2 つは含むべき。
 */
export function looksLikeValidCreatorLooksPrompt(text: string): boolean {
  return (
    text.includes("Styling Direction") &&
    text.includes("Background")
  );
}
