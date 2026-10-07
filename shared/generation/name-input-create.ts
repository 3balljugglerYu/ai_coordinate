/**
 * 「本文から文字入力の欄を作る」道具(docs/planning/name-input-slot-plan.md REQ-009)。
 *
 * ChatGPT 向けに書かれたプロンプトの「使う人に入れてもらう文字に関する行」(【名前】の見出し・
 * 名前や好きな言葉の入れ方・条件の※など)を、文字入力の欄の目印1つにまとめる
 * (最初は名前専用。2026-10-07 に名前以外の文字にも広げた)。
 *
 * ⭐ 言い換えない(「ガチャに分ける」と同じ作り。gacha-split.ts)。文章の AI には本文を書かせず、
 * 「名前に関する行の番号」だけを返させる。本文はここで「元の行 − 名前の行 + 目印」として組み立てる。
 * 目印は、名前に関する行のうち最初の行の場所に入れる。
 */

import { joinKeptLines } from "./gacha-split.ts";
import { buildNameInputMarker, removeNameInputMarkers, type NameInputSlot } from "./name-input.ts";

/** 1回作るのに使うペルコイン(2026-10-06 ユーザー決定。ガチャの道具と同じ)。 */
export const NAME_INPUT_CREATE_PERCOIN_COST = 5;

/** 文章の AI に渡す指示。プロンプト本文は別に、行番号を付けて渡す。 */
export const NAME_INPUT_CREATE_INSTRUCTIONS = `You prepare an image-generation prompt for a "text field".

The user's prompt asks the image AI to draw some text that each user should choose: a character's name,
a favorite word or phrase, a short message, etc. (on a name tag, a plate, a sign, a caption...).
Our app will let each user type that text. The server puts ONE marker where that text goes, and replaces the marker
with the text the user typed (or tells the image AI to draw no such text when the field is left empty).

The prompt is given with line numbers ("L<number>: <text>"). Return:

1. inlineLine / inlineText: the ONE place where the user's text should be drawn, when that line also has other words
   that must stay (e.g. L12: 1行目：「〇〇さん」 → inlineLine 12, inlineText "〇〇"; L5: 名札に「ぺる」と書く → inlineText "ぺる").
   inlineText must be copied EXACTLY from that line and be only the variable part (the sample name or a placeholder
   such as 〇〇, ＿＿, [name]). Never include honorifics or decoration around it (さん, 様, ちゃん, くん, quotes, 「」).
   If there is no such line, return inlineLine 0 and inlineText "".
2. removeLines: the numbers of lines that must be deleted. Include ONLY:
   - lines whose only purpose is to give or ask for the text itself (e.g. "【名前】", "名前：〇〇", "Name: ___",
     "ここに名前を入れてください"),
   - lines that explain the sample value itself (e.g. 入力された名前が「ぺる」の場合…), because the sample is replaced,
   - section headings or separators that become empty after the removal.
   Do NOT include the inlineLine.
   KEEP every line about how the text is decorated or laid out: honorifics (さん, 様, ちゃん), line breaks and
   line order, "do not omit", "no spaces", font or size, and every line that describes the drawing itself
   (outfit, pose, background, where the tag or plate is).

If the prompt has nothing about such user-chosen text, return inlineLine 0, inlineText "" and an empty removeLines.`;

/** Responses API の text.format に渡す JSON の形。 */
export const NAME_INPUT_CREATE_JSON_SCHEMA = {
  type: "object",
  properties: {
    inlineLine: { type: "integer" },
    inlineText: { type: "string" },
    removeLines: { type: "array", items: { type: "integer" } },
  },
  required: ["inlineLine", "inlineText", "removeLines"],
  additionalProperties: false,
} as const;

export interface NameInputCreateModelOutput {
  /** 文字を差し込む行(1始まり)。0 は無し。 */
  inlineLine?: unknown;
  /** その行の中で、目印に置き換える部分(見本の名前や 〇〇 など)。 */
  inlineText?: unknown;
  /** 丸ごと消す行。 */
  removeLines?: unknown;
}

export type NameInputCreateResult =
  | {
      ok: true;
      /** 目印を入れた本文。 */
      body: string;
      /** 丸ごと消した行の番号(1始まり・昇順)。画面で赤線を引くのに使う。 */
      removedLines: number[];
      /** 一部を目印に置き換えた行(1始まり)。無ければ null。画面で印を付けるのに使う。 */
      changedLine: number | null;
    }
  | { ok: false; reason: "no_name_lines" | "empty_body" | "invalid_output" };

const NAME_INPUT_MARKER_PATTERN = /\{\{INPUT\*?:[^{}\r\n]*\}\}/;

/**
 * 本文に、もう文字入力の目印があるか(道具を使う必要が無い)。
 * スイッチを入れたときに先頭の行へ入る目印(その行に目印しか無いもの)は除く。
 */
export function hasNameInputMarkerInBody(prompt: string): boolean {
  const lines = prompt.trim().split(/\r?\n/);
  const firstIsSwitchMarker =
    lines.length > 0 && lines[0].trim() !== "" && lines[0].replace(NAME_INPUT_MARKER_PATTERN, "").trim() === "";
  return lines.slice(firstIsSwitchMarker ? 1 : 0).some((line) => NAME_INPUT_MARKER_PATTERN.test(line));
}

/**
 * 道具に渡す前の本文。スイッチを入れたときに先頭へ入った目印の行だけを外す。
 * (本文の中に目印があるときは、道具を使わない。hasNameInputMarkerInBody で先に止める)
 * AI の行番号は、この本文の行を指す。
 */
export function prepareNameInputCreatePrompt(prompt: string): string {
  return removeNameInputMarkers(prompt).trim();
}

function isLineNumber(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;
}

/**
 * AI の出力を確かめ、本文を組み立てる(言い換えはしない。2026-10-07 改訂)。
 *
 * - 文字を差し込む場所(inlineLine/inlineText)があれば、その行の該当部分だけを目印に置き換える。
 *   「〇〇さん」の「さん」や「1行目：」のような、同じ行の前後の文字は残す(以前は行ごと消して「さん」が消えた)
 * - 無ければ、消す行のうち最初の行の場所に目印を入れる(【名前】の見出し行など)
 * - 行番号は範囲内の整数だけを使う。差し込む文字は、その行にそのまま書かれたものだけを使う
 * - 波括弧の目印(ガチャの囲みなど)を含む行は消さない・書き換えない(壊れた出力とみなす)
 * - 差し込む場所も消す行も無い・本文が目印だけになるなら作れない(ペルコインは使わない)
 */
export function applyNameInputCreate(
  original: string,
  output: NameInputCreateModelOutput,
  slot: NameInputSlot,
): NameInputCreateResult {
  const lines = original.split(/\r?\n/);
  const removeLines = output.removeLines ?? [];
  if (!Array.isArray(removeLines)) return { ok: false, reason: "invalid_output" };

  const removed = new Set<number>();
  for (const value of removeLines) {
    if (!isLineNumber(value, lines.length)) return { ok: false, reason: "invalid_output" };
    if (lines[value - 1].includes("{{")) return { ok: false, reason: "invalid_output" };
    removed.add(value);
  }

  const { inlineLine, inlineText } = output;
  let changedLine: number | null = null;
  if (inlineLine !== undefined && inlineLine !== 0) {
    if (!isLineNumber(inlineLine, lines.length)) return { ok: false, reason: "invalid_output" };
    const text = typeof inlineText === "string" ? inlineText : "";
    const line = lines[inlineLine - 1];
    if (!text.trim() || text.includes("{") || text.includes("}") || line.includes("{{") || !line.includes(text)) {
      return { ok: false, reason: "invalid_output" };
    }
    // 差し込む行は消さない(AI が両方に挙げても、差し込みを優先する)
    removed.delete(inlineLine);
    lines[inlineLine - 1] = line.replace(text, buildNameInputMarker(slot));
    changedLine = inlineLine;
  }

  if (changedLine === null && removed.size === 0) return { ok: false, reason: "no_name_lines" };

  const removedLines = [...removed].sort((a, b) => a - b);
  let body: string;
  if (changedLine !== null) {
    body = joinKeptLines(lines, removed);
  } else {
    // 目印は、消す行のうち最初の行の場所に入れる(その行は消さずに目印へ差し替える)
    const [first, ...rest] = removedLines;
    const withMarker = lines.map((line, index) => (index + 1 === first ? buildNameInputMarker(slot) : line));
    body = joinKeptLines(withMarker, new Set(rest));
  }
  if (!removeNameInputMarkers(body).trim()) return { ok: false, reason: "empty_body" };

  return { ok: true, body, removedLines, changedLine };
}
