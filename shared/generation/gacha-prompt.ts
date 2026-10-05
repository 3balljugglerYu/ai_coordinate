/**
 * ガチャプロンプト。
 *
 * プロンプトの中の `{{GACHA}}` 〜 `{{/GACHA}}` で囲んだ番号付きの候補から、
 * 生成のたびに1つをランダムに選び、その1つだけを残して画像モデルへ送る。
 *
 * 候補を全部並べたまま「7番を使って」と頼んでも、画像モデルは先頭の候補へ
 * 引っ張られる。モデルに選ばせず、送る前に候補を1つへ絞るのがこの仕組みの要点。
 *
 * 絞るのは Worker（送信直前）。派生生成（このカタログで生成する）の本文は
 * Worker が原作者の入力から解決するので、作った本人の生成でも、ほかの人の
 * 生成でも同じ場所でガチャが効く。保存される本文は囲みを含んだまま。
 *
 * Edge Function (Deno) / Next.js (Node) 双方から import するため pure TypeScript。
 */

export const GACHA_OPEN_TAG = "{{GACHA}}";
export const GACHA_CLOSE_TAG = "{{/GACHA}}";

/** ガチャの入力欄に最初から入れておく雛形。 */
export const GACHA_FIELD_TEMPLATE = `${GACHA_OPEN_TAG}\n1. \n2. \n3. \n4. \n${GACHA_CLOSE_TAG}`;

/** 中身のある候補がこの数に満たない囲みは、ガチャとして受け付けない。 */
export const GACHA_MIN_CANDIDATES = 2;

/**
 * 1つの囲みに書ける候補の上限(2026-10-05 ユーザー決定。全員10個)。
 *
 * 候補の数は生成の費用を変えない。上限は、あとで課金(サブスク)で広げる余地を残すために
 * 公開前から付けておく(公開後に絞ると、作ったガチャが使えなくなるため)。
 * 判定は作った人のプロンプトだけに掛ける。ほかの人のプロンプトで生成する派生生成は見ない。
 */
export const GACHA_MAX_CANDIDATES = 10;

/**
 * 1つのプロンプトに書ける囲み(ガチャの要素)の数の上限(2026-10-05 ユーザー決定。一般の利用者は1つ)。
 *
 * 候補の数と同じく、あとで課金で広げる余地を残すため公開前から付ける。
 * 運営はテストのため制限しない(呼び出し側で null を渡す)。作った人のプロンプトだけを見る。
 */
export const GACHA_MAX_BLOCKS = 1;

/** ガチャの上限。null は「数えない」。 */
export interface GachaLimits {
  /** 1つのプロンプトに書ける囲み(要素)の数 */
  maxBlocks: number | null;
  /** 1つの囲みに書ける候補の数 */
  maxCandidates: number | null;
}

/** 一般の利用者の上限。 */
export const GACHA_DEFAULT_LIMITS: GachaLimits = {
  maxBlocks: GACHA_MAX_BLOCKS,
  maxCandidates: GACHA_MAX_CANDIDATES,
};

/**
 * その人のガチャの上限。運営はテストのため、囲みの数も候補の数も制限しない(2026-10-05 ユーザー指示)。
 */
export function gachaLimitsFor(isAdmin: boolean): GachaLimits {
  return isAdmin ? { maxBlocks: null, maxCandidates: null } : GACHA_DEFAULT_LIMITS;
}

/**
 * 選ばれた候補の前に Worker が必ず付ける前置き。
 *
 * 書く人に前置きを任せると、候補の1行だけが何の指定か分からないまま届く。
 * どんなプロンプトにも通じる文を固定で付け、本文の決めつけより優先させる。
 */
export const GACHA_PICK_LEAD =
  "【ガチャで選ばれた指定】\nこの作品では、次の内容を必ず反映する。本文の指示より優先する。";

export interface GachaCandidate {
  /** 書いた人が付けた番号。 */
  number: number;
  text: string;
}

export interface GachaPick {
  /** 選ばれた候補の番号（書いた人が付けた番号）。 */
  number: number;
  /** 中身のある候補の数。 */
  total: number;
}

// 囲みの開始・終了は、それぞれ1行に単独で書かれている前提。
const GACHA_BLOCK_PATTERN =
  /^[ \t]*\{\{GACHA\}\}[ \t]*\r?\n([\s\S]*?)^[ \t]*\{\{\/GACHA\}\}[ \t]*$/gm;
const CANDIDATE_LINE_PATTERN = /^\s*(\d+)\s*[.．、)）]\s*(.*)$/;

/**
 * 囲みの中身から候補を取り出す。
 *
 * 「番号. 内容」の行を1つの候補とし、次の番号の行が来るまでの行はその候補の
 * 続きとして扱う。中身のない番号だけの行（雛形の「5. 」など）は数えない。
 */
export function parseGachaCandidates(blockBody: string): GachaCandidate[] {
  const candidates: GachaCandidate[] = [];
  for (const line of blockBody.split(/\r?\n/)) {
    const numbered = line.match(CANDIDATE_LINE_PATTERN);
    if (numbered) {
      candidates.push({ number: Number(numbered[1]), text: numbered[2].trim() });
      continue;
    }
    const continuation = line.trim();
    const last = candidates[candidates.length - 1];
    if (continuation && last) {
      last.text = last.text ? `${last.text}\n${continuation}` : continuation;
    }
  }
  return candidates.filter((candidate) => candidate.text.length > 0);
}

export type GachaFieldValidation =
  | { ok: true; candidateCount: number }
  | {
      ok: false;
      reason: "missing_block" | "too_many_blocks" | "too_few_candidates" | "too_many_candidates";
    };

/**
 * ガチャの入力欄が送れる状態かを判定する（画面側の案内に使う）。
 *
 * limits は上限。null の項目は数えない(運営)。省略時は一般の利用者の上限。
 */
export function validateGachaField(
  field: string,
  limits: GachaLimits = GACHA_DEFAULT_LIMITS,
): GachaFieldValidation {
  const { maxBlocks, maxCandidates } = limits;
  const blocks = [...field.matchAll(GACHA_BLOCK_PATTERN)];
  if (blocks.length === 0) return { ok: false, reason: "missing_block" };
  if (maxBlocks !== null && blocks.length > maxBlocks) {
    return { ok: false, reason: "too_many_blocks" };
  }
  const counts = blocks.map((block) => parseGachaCandidates(block[1]).length);
  if (counts.some((count) => count < GACHA_MIN_CANDIDATES)) {
    return { ok: false, reason: "too_few_candidates" };
  }
  if (maxCandidates !== null && counts.some((count) => count > maxCandidates)) {
    return { ok: false, reason: "too_many_candidates" };
  }
  return { ok: true, candidateCount: counts[0] };
}


/**
 * 送られてきたプロンプトが、ガチャの上限を超えているか(サーバー側の確認に使う)。
 *
 * 画面は上限を超えると送れないようにしてあるが、直接送られた場合に備えて
 * 生成の受付でも止める。囲みが無いプロンプト・候補が少ない囲みは、ここでは止めない
 * (少ない側は Worker が今までどおり扱う)。null の項目は数えない(運営)。
 */
export function findGachaLimitViolation(
  prompt: string,
  limits: GachaLimits = GACHA_DEFAULT_LIMITS,
): "too_many_blocks" | "too_many_candidates" | null {
  const blocks = [...prompt.matchAll(GACHA_BLOCK_PATTERN)];
  if (limits.maxBlocks !== null && blocks.length > limits.maxBlocks) return "too_many_blocks";
  const { maxCandidates } = limits;
  if (
    maxCandidates !== null &&
    blocks.some((block) => parseGachaCandidates(block[1]).length > maxCandidates)
  ) {
    return "too_many_candidates";
  }
  return null;
}

/** 本文の末尾にガチャの入力欄を付け、保存・送信する1つのプロンプトにする。 */
export function composeGachaPrompt(body: string, field: string): string {
  return `${body.trim()}\n\n${field.trim()}`;
}

/**
 * 囲みごとに候補を1つ選び、前置き＋選ばれた候補に置き換える。
 *
 * 囲みが無いプロンプトはそのまま返す（既存のプロンプトには影響しない）。
 * 中身のある候補が無い囲みは、囲みの文字が画像モデルへ届かないよう取り除く。
 */
export function expandGachaPrompt(
  prompt: string,
  random: () => number = Math.random,
): { prompt: string; picks: GachaPick[] } {
  const picks: GachaPick[] = [];
  const expanded = prompt.replace(GACHA_BLOCK_PATTERN, (_match, body: string) => {
    const candidates = parseGachaCandidates(body);
    if (candidates.length === 0) return "";
    const index = Math.min(
      Math.floor(random() * candidates.length),
      candidates.length - 1,
    );
    const chosen = candidates[index];
    picks.push({ number: chosen.number, total: candidates.length });
    return `${GACHA_PICK_LEAD}\n${chosen.text}`;
  });
  return { prompt: expanded, picks };
}
