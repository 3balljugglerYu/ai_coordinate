/**
 * テキスト中の http/https URL を検出し、リンク化のためのトークン配列に変換する。
 *
 * href はブラウザ遷移用に URL コンストラクタで正規化した値、
 * rawValue はユーザー入力そのまま（末尾句読点のみ剥離）で title 属性に使用する。
 *
 * ハッシュタグのリンク化は **opt-in**（`{ hashtags: true }`）。この関数は
 * キャプションだけでなくプロフィール文とコメントでも使われており、そこでは
 * タグを保存も検索もしていない。一律で効かせると、押しても何も出てこない
 * リンクが並ぶ。
 */

import { tokenizeWithHashtags } from "@/lib/hashtag";

export type LinkifyToken =
  | { type: "text"; value: string }
  | {
      type: "link";
      href: string;
      rawValue: string;
      displayValue: string;
    }
  | {
      type: "hashtag";
      /** `#` を除いた表示名 */
      name: string;
      /** 検索クエリに使う正規化キー */
      normalized: string;
      /** 書かれた原文（`#` や全角 `＃` を含む） */
      rawValue: string;
    };

export interface LinkifyOptions {
  /** `#タグ` も hashtag トークンにする。キャプション表示だけで有効にすること。 */
  hashtags?: boolean;
}

// URL の本体は ASCII 印字可能文字のみ許可する（日本語などの非 ASCII 文字は URL の終端として扱う）。
// < > " ' ` はバリデーション用途で除外。Unicode を含む URL は percent-encoding された状態で受け付ける。
const URL_REGEX = /https?:\/\/[^\s<>"'`\u0080-\uFFFF]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}」』、。]+$/;
const MAX_DISPLAY_LENGTH = 25;

export function linkify(
  text: string,
  options: LinkifyOptions = {}
): LinkifyToken[] {
  if (!text) return [];
  const tokens: LinkifyToken[] = [];
  let lastIndex = 0;

  /*
    URL を先に切り出し、その外側のテキストだけをタグ走査に回す。
    逆順にすると `https://example.com/a#section` の断片がタグになってしまう。
  */
  const pushText = (value: string) => {
    if (!value) return;
    if (!options.hashtags) {
      tokens.push({ type: "text", value });
      return;
    }
    for (const token of tokenizeWithHashtags(value)) {
      tokens.push(token);
    }
  };

  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index!;
    const matched = match[0];

    const trailingMatch = matched.match(TRAILING_PUNCTUATION);
    const trailing = trailingMatch?.[0] ?? "";
    const raw = trailing
      ? matched.slice(0, matched.length - trailing.length)
      : matched;

    if (start > lastIndex) {
      pushText(text.slice(lastIndex, start));
    }

    const parsed = safeParseHttpUrl(raw);
    if (parsed) {
      tokens.push({
        type: "link",
        href: parsed.href,
        rawValue: raw,
        displayValue: formatDisplayUrl(parsed),
      });
    } else {
      tokens.push({ type: "text", value: raw });
    }

    if (trailing) {
      tokens.push({ type: "text", value: trailing });
    }

    lastIndex = start + matched.length;
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  return tokens;
}

function safeParseHttpUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function formatDisplayUrl(url: URL): string {
  const host = url.host.replace(/^www\./, "");
  const tail = url.pathname + url.search + url.hash;
  const combined = host + (tail === "/" ? "" : tail);
  return combined.length > MAX_DISPLAY_LENGTH
    ? combined.slice(0, MAX_DISPLAY_LENGTH - 1) + "…"
    : combined;
}
