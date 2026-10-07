/**
 * 「本文から名前の欄を作る」道具(docs/planning/name-input-slot-plan.md REQ-009)。
 *
 * ChatGPT 向けに書かれたプロンプトの「名前に関する行」(【名前】の見出し・名前の入れ方・
 * 名前の条件の※など)を、名前の欄の目印1つにまとめる。
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
export const NAME_INPUT_CREATE_INSTRUCTIONS = `You prepare an image-generation prompt for a "name field".

The user's prompt asks the image AI to draw a character's name (on a name tag, a sign, a caption, etc.).
Our app will let each user type the name. The server replaces ONE marker with fixed text that tells the image AI
which name to draw (or, when the user leaves it empty, to draw no name at all).

The prompt is given with line numbers ("L<number>: <text>"). Return nameLines: the numbers of the lines that
must be replaced by that marker. Include ONLY:
  - lines that give or ask for the name itself (e.g. "【名前】", "名前：〇〇", "Name: ___", "ここに名前を入れてください"),
  - lines that tell the AI how to handle the name (keep it exactly, do not translate, what to do when no name is given),
  - section headings or separators that become empty after the removal.
Do NOT include lines that describe the drawing itself (outfit, pose, background, where the name tag is), even if they
mention the word "name" in passing, because removing them would lose the design.

If the prompt has nothing about a character's name, return an empty array.`;

/** Responses API の text.format に渡す JSON の形。 */
export const NAME_INPUT_CREATE_JSON_SCHEMA = {
  type: "object",
  properties: {
    nameLines: { type: "array", items: { type: "integer" } },
  },
  required: ["nameLines"],
  additionalProperties: false,
} as const;

export interface NameInputCreateModelOutput {
  nameLines: unknown;
}

export type NameInputCreateResult =
  | {
      ok: true;
      /** 名前の行を目印1つにまとめた本文。 */
      body: string;
      /** まとめた行の番号(1始まり・昇順)。画面で印を付けるのに使う。 */
      removedLines: number[];
    }
  | { ok: false; reason: "no_name_lines" | "empty_body" | "invalid_output" };

/**
 * 道具に渡す前の本文。今ある目印は外す(作る人の画面は、スイッチを入れると先頭に目印を入れるため)。
 * AI の行番号は、この本文の行を指す。
 */
export function prepareNameInputCreatePrompt(prompt: string): string {
  return removeNameInputMarkers(prompt).trim();
}

/**
 * AI の出力を確かめ、本文を組み立てる。
 *
 * - 行番号は範囲内の整数だけを使う(範囲外が1つでもあれば壊れた出力とみなす)
 * - 波括弧の目印(ガチャの囲みなど)を含む行は消さない。消すとガチャが壊れるため、壊れた出力とみなす
 * - 名前の行が無い・本文が目印だけになるなら作れない(ペルコインは使わない)
 */
export function applyNameInputCreate(
  original: string,
  output: NameInputCreateModelOutput,
  slot: NameInputSlot,
): NameInputCreateResult {
  const { nameLines } = output;
  if (!Array.isArray(nameLines)) return { ok: false, reason: "invalid_output" };

  const lines = original.split(/\r?\n/);
  const removed = new Set<number>();
  for (const value of nameLines) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > lines.length
    ) {
      return { ok: false, reason: "invalid_output" };
    }
    if (lines[value - 1].includes("{{")) return { ok: false, reason: "invalid_output" };
    removed.add(value);
  }
  if (removed.size === 0) return { ok: false, reason: "no_name_lines" };

  const removedLines = [...removed].sort((a, b) => a - b);
  // 目印は、名前に関する最初の行の場所に入れる(その行は消さずに目印へ差し替える)
  const [first, ...rest] = removedLines;
  const withMarker = lines.map((line, index) =>
    index + 1 === first ? buildNameInputMarker(slot) : line,
  );
  const body = joinKeptLines(withMarker, new Set(rest));
  if (!removeNameInputMarkers(body).trim()) return { ok: false, reason: "empty_body" };

  return { ok: true, body, removedLines };
}
