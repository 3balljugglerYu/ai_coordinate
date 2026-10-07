/**
 * 文字入力の欄(画面では「文字入力を受け付ける」)。計画書: docs/planning/name-input-slot-plan.md
 *
 * プロンプトに目印 `{{INPUT:見出し}}`(必須なら `{{INPUT*:見出し}}`)を書いておくと、
 * 生成する人が文字(名前・好きな言葉など)を入れられる。画像の AI に送る直前に、Worker が目印を
 * 「文字あり／なし」の固定文に置き換える(ガチャの後)。固定文には作る人が決めた見出しを入れる。
 *
 * 最初は名前専用だったため、コードの名前(nameInput)はそのまま残している(2026-10-07 に汎用化)。
 *
 * AI に「入力があれば…、無ければ…」と判断させないのが要点。入力の有無はサーバーが先に決める。
 *
 * Edge Function (Deno) / Next.js (Node) 双方から import するため pure TypeScript。
 */

import { splitGachaPrompt } from "./gacha-prompt.ts";

/** 名前の長さの上限(文字数。2026-10-06 ユーザー決定)。 */
export const NAME_INPUT_MAX_LENGTH = 8;

/** 一般の利用者が1つのプロンプトに書ける名前の欄の数。運営は制限しない。 */
export const NAME_INPUT_MAX_SLOTS = 1;

/** 見出しの長さの上限(使う人の入力欄に出す)。 */
export const NAME_INPUT_LABEL_MAX_LENGTH = 15;

/**
 * 入力のヒント(使う人の欄にうすい灰色で出る見本)の長さの上限。入れられる文字と同じ8文字
 * (見本だけ長いのはおかしい。2026-10-07 ユーザー指摘)。「例：」は画面で自動で付ける。
 */
export const NAME_INPUT_HINT_MAX_LENGTH = NAME_INPUT_MAX_LENGTH;

/** 見た目の1文字(コードポイント)で先頭から切る。 */
function takeChars(text: string, max: number): string {
  return [...text].slice(0, max).join("");
}

/**
 * 入力のヒントをそろえる。「例：」は画面で付けるので、手で書かれていたら外す(「例：例：」にしない)。
 */
export function normalizeNameInputHint(text: string): string {
  return takeChars(text.trim().replace(/^例\s*[：:]\s*/, ""), NAME_INPUT_HINT_MAX_LENGTH);
}

const NAME_INPUT_PATTERN = /\{\{INPUT(\*)?:([^{}\r\n]*)\}\}/g;

export interface NameInputSlot {
  /** 使う人の入力欄に出す見出し。 */
  label: string;
  /** 必須か(`{{INPUT*:…}}`)。 */
  required: boolean;
  /** 入力例(`{{INPUT:見出し|入力例}}` の `|` の後ろ)。無ければ省く。 */
  placeholder?: string;
}

/** 見出しが空の目印に使う見出し。 */
export const NAME_INPUT_DEFAULT_LABEL = "名前";

/**
 * プロンプトから名前の欄の目印を取り出す(書かれた順)。
 * 見出しが空の目印も、置き換えの対象になるので数える(見出しは既定の「名前」)。
 */
export function parseNameInputSlots(
  prompt: string,
  // 作る人が見出しを書き直している途中は、空のまま返す(既定の見出しで埋めると消せなくなる)
  { keepEmptyLabel = false }: { keepEmptyLabel?: boolean } = {},
): NameInputSlot[] {
  const slots: NameInputSlot[] = [];
  for (const match of prompt.matchAll(NAME_INPUT_PATTERN)) {
    const [rawLabel, ...rest] = match[2].split("|");
    const trimmed = takeChars(rawLabel.trim(), NAME_INPUT_LABEL_MAX_LENGTH);
    const label = trimmed || (keepEmptyLabel ? "" : NAME_INPUT_DEFAULT_LABEL);
    const placeholder = normalizeNameInputHint(rest.join("|"));
    slots.push({ label, required: match[1] === "*", ...(placeholder ? { placeholder } : {}) });
  }
  return slots;
}

/** 目印を作る(作る人の画面から本文へ入れるとき)。 */
/** 目印の中に書ける形にそろえる(波括弧・縦棒・改行を外し、前後の空白を落とす)。 */
export function normalizeNameInputMarkerText(text: string): string {
  return text.replace(/[{}|\r\n]/g, "").trim();
}

export function buildNameInputMarker(slot: NameInputSlot): string {
  const label = normalizeNameInputMarkerText(slot.label);
  const placeholder = slot.placeholder ? normalizeNameInputMarkerText(slot.placeholder) : "";
  return `{{INPUT${slot.required ? "*" : ""}:${label}${placeholder ? `|${placeholder}` : ""}}}`;
}

/**
 * 本文の名前の欄の目印を、設定に合わせて書き換える(作る人の画面)。
 * 目印が無ければ本文の先頭に1行で入れる(作る人は好きな場所へ動かせる)。
 * 目印が複数あるときは、最初の1つだけを書き換える。
 */
export function upsertNameInputMarker(prompt: string, slot: NameInputSlot): string {
  const marker = buildNameInputMarker(slot);
  let replaced = false;
  const next = prompt.replace(NAME_INPUT_PATTERN, (match) => {
    if (replaced) return match;
    replaced = true;
    return marker;
  });
  if (replaced) return next;
  return prompt.trim() ? `${marker}\n${prompt}` : marker;
}

/** 本文から名前の欄の目印をすべて取り除く(作る人がスイッチを切ったとき)。目印だけの行は行ごと消す。 */
export function removeNameInputMarkers(prompt: string): string {
  return prompt
    .replace(/^[ \t]*\{\{INPUT\*?:[^{}\r\n]*\}\}[ \t]*(?:\r?\n|$)/gm, "")
    .replace(NAME_INPUT_PATTERN, "");
}

export type NameInputValueCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "too_long" | "invalid_characters" };

// 改行・制御文字・ゼロ幅文字(書式文字 Cf を含む)・波括弧。
// 波括弧を通すと、名前で目印やガチャの囲みを作れてしまう。
const FORBIDDEN_NAME_CHARACTERS = /[{}\p{Cc}\p{Cf}\u2028\u2029]/u;

/**
 * 名前を確かめる。前後の空白は落とす。空(未入力)は ok で value が "" になる。
 * 文字数は見た目の1文字(コードポイント)で数える。
 */
export function checkNameInputValue(raw: string | null | undefined): NameInputValueCheck {
  const value = (raw ?? "").trim();
  if (FORBIDDEN_NAME_CHARACTERS.test(value)) {
    return { ok: false, reason: "invalid_characters" };
  }
  if ([...value].length > NAME_INPUT_MAX_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, value };
}

/**
 * 固定文の見出し。作る人が決めた見出しを入れて、何の文字か(名前・好きな言葉など)を AI に伝える
 * (2026-10-07 ユーザー決定: 名前に限らず、好きな文字を入れられる機能として出す)。
 * 見出しの【】は固定文の区切りと紛れるので外す。
 */
function fixedTextHeading(label: string): string {
  return label.replace(/[【】]/g, "").trim() || NAME_INPUT_DEFAULT_LABEL;
}

/** 文字が入っているときに目印を置き換える固定文。 */
export function buildNameProvidedText(value: string, label: string = NAME_INPUT_DEFAULT_LABEL): string {
  return [
    `【${fixedTextHeading(label)}】「${value}」`,
    "この文字を正式なものとして固定し、変更・省略・言い換え・翻訳・英字化はしないでください。",
    `画像内に最低1回、「${value}」をそのまま表示してください。`,
  ].join("\n");
}

/** 空欄のときに目印を置き換える固定文。AI がこの項目の文字を作らないようにする。 */
export function buildNameNotProvidedText(label: string = NAME_INPUT_DEFAULT_LABEL): string {
  const heading = fixedTextHeading(label);
  return [
    `【${heading}】未入力`,
    `「${heading}」にあたる文字は作らず、画像にも表示しないでください。`,
  ].join("\n");
}

/**
 * 目印を固定文に置き換える。
 *
 * name は {@link checkNameInputValue} を通したもの。通らない値は「名前なし」として扱う
 * (Worker は image_jobs の行を作成後に本人が書き換えられる前提で、ここでも確かめる)。
 * 目印が無いプロンプトはそのまま返す。
 */
export function expandNameInput(
  prompt: string,
  name: string | null | undefined,
): { prompt: string; nameUsed: boolean; hadSlot: boolean } {
  const check = checkNameInputValue(name);
  const value = check.ok ? check.value : "";
  let hadSlot = false;
  const expanded = prompt.replace(NAME_INPUT_PATTERN, (_marker, _required, inner: string) => {
    hadSlot = true;
    // 目印ごとの見出し(`見出し|入力例` の前半)を固定文に入れる。
    // 入れる文字は1つなので、目印が複数(運営だけ。一般は1つまで)あればどれにも同じ文字が入る
    const label = takeChars(inner.split("|")[0].trim(), NAME_INPUT_LABEL_MAX_LENGTH) || NAME_INPUT_DEFAULT_LABEL;
    return value ? buildNameProvidedText(value, label) : buildNameNotProvidedText(label);
  });
  return { prompt: expanded, nameUsed: hadSlot && value.length > 0, hadSlot };
}

/** 名前の欄の数の上限。null は数えない(運営)。 */
export function nameInputMaxSlotsFor(isAdmin: boolean): number | null {
  return isAdmin ? null : NAME_INPUT_MAX_SLOTS;
}

/**
 * 画像の AI に届く名前の欄の数(多いほう)。
 *
 * Worker はガチャで1つを選んだ後に名前の欄を置き換えるので、ガチャの囲みの中の目印は
 * 「選ばれうる候補のうち、いちばん多いもの」だけが届く。囲みの外の目印は必ず届く。
 */
export function countReachableNameInputSlots(prompt: string): number {
  const { outside, blocks } = splitGachaPrompt(prompt);
  let count = parseNameInputSlots(outside).length;
  for (const candidates of blocks) {
    count += Math.max(0, ...candidates.map((text) => parseNameInputSlots(text).length));
  }
  return count;
}

/**
 * 必ず AI に届く必須の名前の欄があるか(ガチャの囲みの外にあるもの)。
 * 囲みの中の必須の欄は、選ばれるかどうか送る前には分からないので、ここでは止めない
 * (選ばれて名前が空なら「名前なし」に置き換わる)。
 */
export function hasGuaranteedRequiredNameInput(prompt: string): boolean {
  return parseNameInputSlots(splitGachaPrompt(prompt).outside).some((slot) => slot.required);
}

/** 送られてきたプロンプトの名前の欄が上限を超えるか(サーバー側の確認に使う)。 */
export function exceedsNameInputSlotLimit(prompt: string, maxSlots: number | null): boolean {
  if (maxSlots === null) return false;
  return countReachableNameInputSlots(prompt) > maxSlots;
}

/** カタログから使う人の画面に出す名前の欄(本文は含めない)。 */
export interface NameInputForUsers {
  label: string;
  placeholder?: string;
  /** 必ず AI に届く必須の欄があるか(ガチャの候補の中の必須は含めない)。 */
  required: boolean;
}

/**
 * 使う人に見せる名前の欄の情報を、本文から取り出す(本文そのものは返さない)。
 * 見出しは、ガチャの囲みの外の最初の欄、無ければ候補の中の最初の欄。届く欄が無ければ null。
 */
export function describeNameInputForUsers(prompt: string): NameInputForUsers | null {
  if (countReachableNameInputSlots(prompt) === 0) return null;
  const { outside, blocks } = splitGachaPrompt(prompt);
  const first =
    parseNameInputSlots(outside)[0] ??
    blocks.flat().map((text) => parseNameInputSlots(text)[0]).find(Boolean);
  if (!first) return null;
  return {
    label: first.label,
    ...(first.placeholder ? { placeholder: first.placeholder } : {}),
    required: hasGuaranteedRequiredNameInput(prompt),
  };
}

/**
 * ガチャ(`{{GACHA}}`)と文字入力の目印を、1つのプロンプトで一緒に使っているか。
 * 一般の利用者は、どちらか1つだけ(一緒に使えるのはサブスクの構想。2026-10-07 ユーザー決定)。運営は制限しない。
 * 目印がガチャの候補の中にあっても、一緒に使っているとみなす。
 */
export function usesGachaWithNameInput(prompt: string): boolean {
  return splitGachaPrompt(prompt).blocks.length > 0 && parseNameInputSlots(prompt).length > 0;
}

