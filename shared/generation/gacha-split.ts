/**
 * 「ガチャに分ける」道具。
 *
 * ChatGPT 向けに書かれたプロンプト（AI に候補から選ばせる書き方）を、
 * ペルスタのガチャプロンプト（本文 + {{GACHA}} の候補欄）に分ける。
 *
 * ⭐ 言い換えない（docs/planning/prompt-slots-implementation-plan.md ADR-002）。
 * 文章の AI には本文を書かせず、「消す行の番号」と「候補」だけを返させる。
 * 本文はここで「元の行 − 消す行」として組み立てるので、言い換えや抜けが入らない。
 * 候補は元の文にある言葉かを確かめ、作り足されたものは捨てる。
 */

import {
  GACHA_CLOSE_TAG,
  GACHA_DEFAULT_LIMITS,
  GACHA_MIN_CANDIDATES,
  GACHA_OPEN_TAG,
  type GachaLimits,
  validateGachaField,
} from "./gacha-prompt";

/** 1回分けるのに使うペルコイン（2026-10-04 ユーザー決定）。 */
export const GACHA_SPLIT_PERCOIN_COST = 5;

/** 候補が多すぎる出力は、壊れた出力として扱う。 */
export const GACHA_SPLIT_MAX_CANDIDATES = 100;

/** 文章の AI に渡す指示。プロンプト本文は別に、行番号を付けて渡す。 */
export const GACHA_SPLIT_INSTRUCTIONS = `You convert an image-generation prompt into a "gacha prompt".

The user's prompt asks the image AI to pick ONE item at random from a list of candidates (jobs, places, playground equipment, etc.).
Image AIs cannot pick at random; they always pick the first item. Our server will pick the candidate instead.

The prompt is given with line numbers ("L<number>: <text>"). Return:

1. removeLines: the numbers of the lines that must be removed from the main prompt. Remove ONLY:
   - the lines that list the candidates,
   - the lines that ask the AI to choose / pick / randomize / avoid repeating a choice,
   - the lines that ask the AI to show or announce the chosen result as text before drawing,
   - section headings or separators that become empty after the removal.
   Keep every other line, including lines that describe how to draw the chosen item.
2. candidates: every candidate, one per item, copied EXACTLY as written in the prompt.
   - Do not translate, rephrase, summarize, add or invent candidates.
   - If several candidates are written on one line separated by "、", ",", "／", "/" or similar, split them into separate items.
   - Do not include numbering or bullet marks.
   - Exclude words that are explicitly given as things to avoid.
3. listCount: how many SEPARATE lists of candidates the prompt asks to pick from.
   Count lists of different kinds separately (e.g. a list of jobs and a list of places = 2).
   Several lines that together form one list of the same kind count as 1. Return 0 if there is no list.

If the prompt has no list of candidates to choose from, return empty arrays.`;

/** Responses API の text.format に渡す JSON の形。 */
export const GACHA_SPLIT_JSON_SCHEMA = {
  type: "object",
  properties: {
    removeLines: { type: "array", items: { type: "integer" } },
    candidates: { type: "array", items: { type: "string" } },
    listCount: { type: "integer" },
  },
  required: ["removeLines", "candidates", "listCount"],
  additionalProperties: false,
} as const;

/** 行番号付きの本文（AI に渡す形）。 */
export function numberPromptLines(prompt: string): string {
  return prompt
    .split(/\r?\n/)
    .map((line, index) => `L${index + 1}: ${line}`)
    .join("\n");
}

export interface GachaSplitModelOutput {
  removeLines: unknown;
  candidates: unknown;
  /** 候補の一覧(ガチャの要素)がいくつあるか。2つ以上なら、1つの囲みには分けない */
  listCount?: unknown;
}

export type GachaSplitResult =
  | {
      ok: true;
      /** 元の行から、消す行を除いた本文。 */
      body: string;
      /** {{GACHA}} 〜 {{/GACHA}} の候補欄。 */
      field: string;
      /** 消した行の番号（1始まり・昇順）。画面で「消す行」に印を付けるのに使う。 */
      removedLines: number[];
      candidateCount: number;
    }
  | {
      ok: false;
      reason:
        | "no_candidates"
        | "too_many_blocks"
        | "too_many_candidates"
        | "empty_body"
        | "invalid_output";
    };

const LEADING_MARK_PATTERN = /^\s*(?:\d+\s*[.．、)）]|[・•\-*])\s*/;

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * 候補の文字列を、元の文（消す行）にある形へそろえる。
 *
 * 一覧の番号や記号（「1. 」「・」「3）」）は外す。ただし「2.5Dイラスト」「3、4人の家族」
 * 「-5℃の雪原」のように、番号や記号で始まる候補そのものは削らない。
 * - 必ず一覧の印とみなすもの: 「・」「•」、数字＋「．」「）」「)」
 * - 後ろに空白があるときだけ印とみなすもの: 数字＋「.」「、」、「-」「*」
 * - それ以外は、付けたままで元の文に無いときだけ外してみる
 */
const LIST_MARK_PATTERN = /^\s*(?:\d+\s*[．）)]|[・•])\s*|^\s*(?:\d+\s*[.、]|[-*])\s+/;

function resolveCandidateText(value: string, source: string): string | null {
  const text = value.replace(/\s*\r?\n\s*/g, " ").trim();
  if (!text) return null;
  const inSource = (candidate: string) =>
    candidate.length > 0 && source.includes(normalizeForMatch(candidate));
  if (LIST_MARK_PATTERN.test(text)) {
    const stripped = text.replace(LIST_MARK_PATTERN, "").trim();
    return inSource(stripped) ? stripped : null;
  }
  if (inSource(text)) return text;
  const loose = text.replace(LEADING_MARK_PATTERN, "").trim();
  return loose !== text && inSource(loose) ? loose : null;
}

/**
 * 消した行の跡にできた空行の連なりだけを1つにする（元からある空行はそのまま）。
 */
function joinKeptLines(lines: string[], removed: Set<number>): string {
  const kept: string[] = [];
  let removedSinceLastKept = false;
  lines.forEach((line, index) => {
    if (removed.has(index + 1)) {
      removedSinceLastKept = true;
      return;
    }
    const previous = kept[kept.length - 1];
    if (
      removedSinceLastKept &&
      line.trim() === "" &&
      previous !== undefined &&
      previous.trim() === ""
    ) {
      return;
    }
    kept.push(line);
    removedSinceLastKept = false;
  });
  return kept.join("\n").trim();
}

/**
 * AI の出力を確かめ、本文と候補欄を組み立てる。
 *
 * - 行番号は範囲内の整数だけを使う（範囲外が1つでもあれば壊れた出力とみなす）
 * - 候補は**消す行の中にある**ものだけを残す。本文に候補の並びが残ったままだと、
 *   画像の AI が1番目に引っ張られる元の問題が直らないため（AI が作り足した候補もここで落ちる）
 * - 候補の一覧が2つ以上あるなら分けない(1つの囲みに混ざるのを防ぐ)
 * - 残った候補が2つ未満・上限(一般は10個。運営は無し)を超える、または本文が空になるなら分けられない
 */
export function applyGachaSplit(
  original: string,
  output: GachaSplitModelOutput,
  // 候補の数の上限。運営は制限しない(gachaLimitsFor)。省略時は一般の利用者の上限
  limits: GachaLimits = GACHA_DEFAULT_LIMITS,
): GachaSplitResult {
  const { removeLines, candidates } = output;
  if (!Array.isArray(removeLines) || !Array.isArray(candidates)) {
    return { ok: false, reason: "invalid_output" };
  }

  const lines = original.split(/\r?\n/);
  const removed = new Set<number>();
  for (const value of removeLines) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > lines.length
    ) {
      return { ok: false, reason: "invalid_output" };
    }
    removed.add(value);
  }

  if (candidates.length > GACHA_SPLIT_MAX_CANDIDATES) {
    return { ok: false, reason: "invalid_output" };
  }

  // 一覧が2つ以上(職業と場所など)あるプロンプトは、1つの囲みにまとめると「どちらか1つ」が
  // 選ばれてしまう。混ぜずに分けない(2026-10-05 ユーザー指示)。この道具が作る囲みは1つだけ
  const { listCount } = output;
  if (typeof listCount === "number" && Number.isInteger(listCount) && listCount >= 2) {
    return { ok: false, reason: "too_many_blocks" };
  }

  const removedSource = normalizeForMatch(
    lines.filter((_, index) => removed.has(index + 1)).join("\n"),
  );
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    if (typeof value !== "string") return { ok: false, reason: "invalid_output" };
    // 候補欄では1行=1候補なので、改行は空白にそろえる
    const text = resolveCandidateText(value, removedSource);
    if (!text) continue;
    const key = normalizeForMatch(text);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }

  if (kept.length < GACHA_MIN_CANDIDATES) {
    return { ok: false, reason: "no_candidates" };
  }
  // 上限を超える候補は、勝手に削らずに分けない(どれを残すかは書いた人が決める)。ペルコインは使わない
  if (limits.maxCandidates !== null && kept.length > limits.maxCandidates) {
    return { ok: false, reason: "too_many_candidates" };
  }

  const body = joinKeptLines(lines, removed);
  if (!body) return { ok: false, reason: "empty_body" };

  const field = [
    GACHA_OPEN_TAG,
    ...kept.map((text, index) => `${index + 1}. ${text}`),
    GACHA_CLOSE_TAG,
  ].join("\n");
  // 生成側と同じ読み取りで、そのまま送れる欄になっていることを確かめる
  const validation = validateGachaField(field, limits);
  if (!validation.ok || validation.candidateCount !== kept.length) {
    return { ok: false, reason: "invalid_output" };
  }

  return {
    ok: true,
    body,
    field,
    removedLines: [...removed].sort((a, b) => a - b),
    candidateCount: kept.length,
  };
}

/**
 * Responses API の応答から、出力の文字列を取り出す。
 * output[].content[] の最初の output_text を使う（output_text が直接あればそれ）。
 */
export function extractResponsesOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text) {
    return record.output_text;
  }
  if (!Array.isArray(record.output)) return null;
  for (const item of record.output) {
    const content = (item as Record<string, unknown> | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const partRecord = part as Record<string, unknown> | null;
      if (
        partRecord?.type === "output_text" &&
        typeof partRecord.text === "string" &&
        partRecord.text
      ) {
        return partRecord.text;
      }
    }
  }
  return null;
}
