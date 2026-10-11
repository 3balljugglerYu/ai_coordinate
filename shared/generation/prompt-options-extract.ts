/**
 * 本文に貼り付けられた「ガチャの囲み」「文字入力の目印」を、それぞれの欄へ移すための取り出し
 * (2026-10-11 ユーザー決定 案A)。
 *
 * 生成結果の「使用プロンプト」には、送った文(先頭の `{{INPUT:…}}`・末尾の `{{GACHA}}…{{/GACHA}}` 付き)が
 * そのまま残る。それを本文に貼り付けると、スイッチの分と合わせて欄が2つになり、一般の利用者は生成できない。
 * 本文には目印を出さない形(#724)なので、貼り付けられたら欄へ移す。
 *
 * - ガチャ: 行頭の `{{GACHA}}` から `{{/GACHA}}` までの囲みを、すべてガチャの欄へ(書かれた順に空行でつなぐ)
 * - 文字入力: 1行まるごと目印の行のうち、最初の1つを欄の設定へ。文中の目印(「{{INPUT:名前}}さん」など)は動かさない
 *
 * Edge Function (Deno) / Next.js (Node) 双方から import するため pure TypeScript。
 */

import { parseNameInputSlots, type NameInputSlot } from "./name-input.ts";

// gacha-prompt.ts の囲みと同じ形(行頭の {{GACHA}} 〜 {{/GACHA}})
const GACHA_BLOCK_PATTERN = /^[ \t]*\{\{GACHA\}\}[ \t]*\r?\n[\s\S]*?^[ \t]*\{\{\/GACHA\}\}[ \t]*$/gm;
const NAME_INPUT_LINE_PATTERN = /^[ \t]*(\{\{INPUT\*?:[^{}\r\n]*\}\})[ \t]*(?:\r?\n|$)/m;

export interface ExtractedPromptOptions {
  /** 移した後の本文。 */
  body: string;
  /** ガチャの欄に入れる囲み(無ければ null)。 */
  gachaField: string | null;
  /** 文字入力の欄の設定(無ければ null)。 */
  nameSlot: NameInputSlot | null;
}

/** 取り除いた跡の空行の連なりを1つにし、前後の空白行を落とす。 */
function tidy(text: string): string {
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
}

/**
 * 本文からガチャの囲み・文字入力の目印を取り出す。どちらも無ければ null(本文はそのまま使う)。
 * 使えない仕掛け(公開前の人など)は取り出さない。
 */
export function extractPromptOptions(
  text: string,
  { gacha, nameInput }: { gacha: boolean; nameInput: boolean },
): ExtractedPromptOptions | null {
  let body = text;
  let gachaField: string | null = null;
  let nameSlot: NameInputSlot | null = null;

  if (gacha) {
    const blocks: string[] = [];
    body = body.replace(GACHA_BLOCK_PATTERN, (block) => {
      blocks.push(block.trim());
      return "";
    });
    if (blocks.length > 0) gachaField = blocks.join("\n\n");
  }

  if (nameInput) {
    const match = body.match(NAME_INPUT_LINE_PATTERN);
    if (match && match.index !== undefined) {
      nameSlot = parseNameInputSlots(match[1], { keepEmptyLabel: true })[0] ?? null;
      body = body.slice(0, match.index) + body.slice(match.index + match[0].length);
    }
  }

  if (gachaField === null && nameSlot === null) return null;
  return { body: tidy(body), gachaField, nameSlot };
}
