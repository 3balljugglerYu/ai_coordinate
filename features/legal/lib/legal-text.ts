/**
 * 法務のページ(プライバシーポリシー・利用者情報の外部送信について)で使う、
 * 日付の書き方と、本文の中のリンクの見つけ方(純関数)。
 */

export interface LegalDate {
  year: number;
  month: number;
  day: number;
}

/** 「2026年10月26日 改定」/「Last revised: October 26, 2026」など。ja 以外は英語で出す。 */
export function formatLegalDate(
  date: LegalDate,
  locale: string,
  kind: "revised" | "established",
): string {
  if (locale === "ja") {
    return `${date.year}年${date.month}月${date.day}日 ${kind === "revised" ? "改定" : "制定"}`;
  }
  const text = new Date(Date.UTC(date.year, date.month - 1, date.day)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${kind === "revised" ? "Last revised" : "Established"}: ${text}`;
}

export type LegalTextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string; external: boolean };

export interface LegalLink {
  /** 本文の中で、リンクにする文字列(そのまま本文に書いた文字と同じにすること) */
  match: string;
  href: string;
  external: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 本文を、ふつうの文字とリンクに分ける。リンクの一覧から見つけ方を作るので、
 * 一覧に足せば、見つけ方を別に直さなくても、リンクになる。
 */
export function splitLegalText(text: string, links: readonly LegalLink[]): LegalTextSegment[] {
  if (links.length === 0) return [{ type: "text", text }];
  const pattern = new RegExp(`(${links.map((l) => escapeRegExp(l.match)).join("|")})`);
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => {
      const link = links.find((l) => l.match === part);
      return link
        ? { type: "link", text: part, href: link.href, external: link.external }
        : { type: "text", text: part };
    });
}
