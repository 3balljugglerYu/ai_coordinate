/**
 * キャプション中のハッシュタグ規則の**正本**。
 *
 * 抽出（保存）・表示のリンク化・入力中の着色の 3 つが必ずこのファイルを通る（REQ-09）。
 * 規則を SQL や個別コンポーネントに書き写すと、保存されたタグと画面の青字がズレる。
 *
 * 規則は X の実機検証（2026-08-28）と twitter-text の公開仕様に合わせている:
 *
 * | 入力 | 結果 |
 * |---|---|
 * | `#冬服_みきふく` | 1つのタグ（`_` はタグの一部） |
 * | `#冬服#みきふく` | タグなし（`#` が続くと前のタグごと無効） |
 * | `#冬服 #みきふく` | 2つのタグ |
 * | `#冬服、かわいい` | タグ「冬服」 |
 * | `#AI` と `#ai` | 同じタグ（正規化キーで同一視。表示は原文） |
 */

/** タグ1つの最大長（`#` を除いた表示名の書記素数ではなくコードポイント数）。超過は黙って無視する。 */
export const HASHTAG_MAX_LENGTH = 50;

/** 1つのキャプションから拾うタグの最大個数（同一タグの重複は1個と数える）。超過は黙って無視する。 */
export const HASHTAG_MAX_PER_POST = 10;

export interface ExtractedHashtag {
  /** 表示用。書かれた原文から `#` を除いたもの。 */
  name: string;
  /** 同一視キー。NFKC 正規化 + 小文字化。DB の `hashtags.name_normalized` に対応。 */
  normalized: string;
}

export type HashtagToken =
  | { type: "text"; value: string }
  | {
      type: "hashtag";
      /** `#` を除いた表示名。 */
      name: string;
      /** 検索クエリに使う正規化キー。 */
      normalized: string;
      /** 書かれた原文（`#` や全角 `＃` を含む）。表示はこれをそのまま出す。 */
      rawValue: string;
    };

// タグには文字か結合文字が最低1つ必要（`#123` や `#___` は無効。twitter-text と同じ）。
const TAG_ALPHA = /[\p{L}\p{M}]/u;
// 開始記号は半角 `#` と全角 `＃` の両方。
const HASH_SIGN = /[#＃]/;
// タグの直後がこれらの場合、そのタグ全体を無効にする。
// `#` → `#冬服#みきふく` がタグなしになる規則。`://` → `#foo://bar` を URL の一部と見なす。
const INVALIDATING_SUFFIX = /^(?:[#＃]|:\/\/)/;
// 直前がこれらならタグの開始として認めない。`&` は `&#39;` のような HTML 実体参照の除外。
const INVALID_PRECEDING = /[&\p{L}\p{M}\p{Nd}_]/u;
// 異体字セレクタは結合文字（\p{M}）だが、絵文字直後の `#` を殺さないよう例外的に許可する。
const VARIATION_SELECTORS = /[\uFE0E\uFE0F]/;

// タグ本体に使える文字は Unicode の文字・結合文字・数字 + `_`。
// 日本語限定にしないのは、アプリが 15 ロケール（ko/th/hi/ar 含む）で動くため。
const HASHTAG_CANDIDATE = /[#＃][\p{L}\p{M}\p{Nd}_]+/gu;
/** 1文字がタグ本体に使えるか（書きかけの検出に使う）。 */
const TAG_CHAR_ONLY = /^[\p{L}\p{M}\p{Nd}_]$/u;

interface HashtagMatch {
  start: number;
  end: number;
  rawValue: string;
  name: string;
  normalized: string;
}

/**
 * 同一視キーを作る。NFKC で全角英数・半角カナの表記ゆれを畳み、小文字化で `#AI` と `#ai` を揃える。
 * ロケール依存の toLocaleLowerCase は使わない（トルコ語の I で結果が変わるため）。
 */
export function normalizeHashtag(name: string): string {
  return name.normalize("NFKC").toLowerCase();
}

/**
 * 有効なタグだけを出現順に拾う内部スキャナ。
 * 抽出・トークナイズの両方がこれを共有するので、青字とDBが食い違わない。
 */
function scanHashtags(text: string): HashtagMatch[] {
  if (!text) return [];

  const matches: HashtagMatch[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(HASHTAG_CANDIDATE)) {
    const start = match.index!;
    const rawValue = match[0];
    const end = start + rawValue.length;

    const preceding = precedingChar(text, start);
    if (
      preceding &&
      !VARIATION_SELECTORS.test(preceding) &&
      (INVALID_PRECEDING.test(preceding) || HASH_SIGN.test(preceding))
    ) {
      continue;
    }

    if (INVALIDATING_SUFFIX.test(text.slice(end))) continue;

    const name = rawValue.slice(1);
    if (!TAG_ALPHA.test(name)) continue;
    if ([...name].length > HASHTAG_MAX_LENGTH) continue;

    const normalized = normalizeHashtag(name);
    // 上限は「別のタグ」の個数。既出タグの2回目以降は上限を消費しない。
    if (!seen.has(normalized)) {
      if (seen.size >= HASHTAG_MAX_PER_POST) continue;
      seen.add(normalized);
    }

    matches.push({ start, end, rawValue, name, normalized });
  }

  return matches;
}

/** サロゲートペアを壊さずに index の直前の1文字を返す。 */
function precedingChar(text: string, index: number): string {
  return previousCodePoint(text, index)?.char ?? "";
}

/**
 * index の直前にある 1 コードポイントと、その開始位置を返す。
 * サロゲートペアは 2 コードユニットまとめて 1 文字として扱う。
 */
function previousCodePoint(
  text: string,
  index: number
): { char: string; index: number } | null {
  if (index <= 0) return null;

  const code = text.charCodeAt(index - 1);
  const isLowSurrogate = code >= 0xdc00 && code <= 0xdfff;
  if (isLowSurrogate && index >= 2) {
    const previous = text.charCodeAt(index - 2);
    if (previous >= 0xd800 && previous <= 0xdbff) {
      return { char: text.slice(index - 2, index), index: index - 2 };
    }
  }

  return { char: text[index - 1], index: index - 1 };
}

/**
 * 保存用。重複を畳んで出現順に返す（表示名は初出の表記を採用）。
 */
export function extractHashtags(text: string): ExtractedHashtag[] {
  const result: ExtractedHashtag[] = [];
  const seen = new Set<string>();

  for (const match of scanHashtags(text)) {
    if (seen.has(match.normalized)) continue;
    seen.add(match.normalized);
    result.push({ name: match.name, normalized: match.normalized });
  }

  return result;
}

/**
 * 表示・入力着色用。`lib/linkify.ts` と同じ「text とリンクの交互配列」の形にそろえる。
 *
 * 無効なタグ（`#冬服#` や上限超過）は hashtag トークンにせず text のまま返す。
 * 保存されないものを青くしないため。
 */
export function tokenizeWithHashtags(text: string): HashtagToken[] {
  if (!text) return [];

  const tokens: HashtagToken[] = [];
  let lastIndex = 0;

  for (const match of scanHashtags(text)) {
    if (match.start > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.start) });
    }
    tokens.push({
      type: "hashtag",
      name: match.name,
      normalized: match.normalized,
      rawValue: match.rawValue,
    });
    lastIndex = match.end;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

/**
 * 入力位置がタグの途中かどうかを見て、書きかけのタグを取り出す。
 *
 * 「いま `#冬` まで打った」を検出して候補を出すために使う。書きかけなので
 * {@link extractHashtags} では拾えない（まだタグとして完成していない）。
 *
 * @param caret 現在のカーソル位置（この手前までを見る）
 * @returns 置き換え範囲と `#` を除いた入力中の文字。タグの途中でなければ null
 */
export function findHashtagQueryAt(
  text: string,
  caret: number
): { start: number; end: number; query: string } | null {
  if (caret < 0 || caret > text.length) return null;

  // コードポイント単位で戻る。`text[index - 1]` で1コードユニットずつ見ると、
  // サロゲートペア（𠮷 など）の後半だけを判定して必ず false になり、
  // 保存はできるのに入力中サジェストだけ出ない、という食い違いになる。
  let index = caret;
  for (;;) {
    const previous = previousCodePoint(text, index);
    if (!previous || !TAG_CHAR_ONLY.test(previous.char)) break;
    index = previous.index;
  }

  // 直前が `#` でなければタグを書いている途中ではない
  if (index === 0 || !HASH_SIGN.test(text[index - 1])) return null;

  const signIndex = index - 1;
  const preceding = precedingChar(text, signIndex);
  if (
    preceding &&
    !VARIATION_SELECTORS.test(preceding) &&
    (INVALID_PRECEDING.test(preceding) || HASH_SIGN.test(preceding))
  ) {
    return null;
  }

  return {
    start: signIndex,
    end: caret,
    query: text.slice(index, caret),
  };
}

/** 1つの企画（プリセットカテゴリ）に設定できるタグ候補の上限。 */
export const HASHTAG_SUGGESTIONS_MAX = 5;

/**
 * 「タグとして書ける名前か」を、抽出規則そのもので判定する。
 *
 * 別の正規表現で検証すると、設定はできるのに投稿するとタグにならない
 * （説明文に入れても青くならない）候補を作れてしまう。
 *
 * @param name `#` を含まない表記
 */
export function isValidHashtagName(name: string): boolean {
  const [tag] = extractHashtags(`#${name}`);
  return Boolean(tag && tag.name === name);
}

/**
 * admin の入力欄（改行・カンマ・空白区切り）を候補の配列にする。
 *
 * `#` を付けて書かれても受け付ける（付けるのが自然なので、弾くと迷わせる）。
 * 同じタグの重複は畳み、上限を超えた分は捨てる。
 */
export function parseHashtagSuggestions(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of raw.split(/[\s,、]+/)) {
    const name = token.replace(/^[#＃]+/, "").trim();
    if (!name || !isValidHashtagName(name)) continue;

    const normalized = normalizeHashtag(name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    result.push(name);
    if (result.length >= HASHTAG_SUGGESTIONS_MAX) break;
  }

  return result;
}

/**
 * タグリンクの遷移先。`/search?q=%23タグ` に統一する（ADR-003。専用ページは作らない）。
 *
 * クエリには**書かれたままの表記**を載せる。正規化キー（小文字化・NFKC 済み）を
 * 載せると、`#PerstaAI` を押した先の検索ボックスが `#perstaai` になり、
 * 自分が書いた見た目が勝手に崩れる。一致判定は検索側が正規化して行うので、
 * 表記を保っても `#AI` と `#ai` は同じ結果になる。
 */
export function buildHashtagSearchHref(name: string): string {
  return `/search?q=${encodeURIComponent(`#${name}`)}`;
}
