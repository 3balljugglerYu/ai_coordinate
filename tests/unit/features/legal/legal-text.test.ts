/**
 * 法務のページの日付とリンク。
 * 文を書き直したときに、リンクが黙って消えたり、日付が日本語と英語でずれたりしないように固定する。
 */

import { formatLegalDate, splitLegalText } from "@/features/legal/lib/legal-text";

const DATE = { year: 2026, month: 10, day: 26 };

describe("formatLegalDate", () => {
  test("日本語は「年月日 改定/制定」", () => {
    expect(formatLegalDate(DATE, "ja", "revised")).toBe("2026年10月26日 改定");
    expect(formatLegalDate(DATE, "ja", "established")).toBe("2026年10月26日 制定");
  });

  test("ほかの言語は英語で、同じ日付", () => {
    expect(formatLegalDate(DATE, "en", "revised")).toBe("Last revised: October 26, 2026");
    expect(formatLegalDate(DATE, "ko", "established")).toBe("Established: October 26, 2026");
  });
});

describe("splitLegalText", () => {
  const links = [
    { match: "https://policies.google.com/privacy", href: "https://policies.google.com/privacy", external: true },
    { match: "「利用者情報の外部送信について」", href: "/ja/external-transmission", external: false },
  ];

  test("外の URL と、ページへの言葉を、それぞれリンクにする", () => {
    expect(
      splitLegalText(
        "Google のプライバシーポリシー（https://policies.google.com/privacy）。詳しくは「利用者情報の外部送信について」をご覧ください。",
        links,
      ),
    ).toEqual([
      { type: "text", text: "Google のプライバシーポリシー（" },
      { type: "link", text: "https://policies.google.com/privacy", href: "https://policies.google.com/privacy", external: true },
      { type: "text", text: "）。詳しくは" },
      { type: "link", text: "「利用者情報の外部送信について」", href: "/ja/external-transmission", external: false },
      { type: "text", text: "をご覧ください。" },
    ]);
  });

  test("リンクが無い文は、そのまま1つの文字", () => {
    expect(splitLegalText("ふつうの文です。", links)).toEqual([{ type: "text", text: "ふつうの文です。" }]);
  });

  test("URL の . などは、正規表現の記号として扱わない", () => {
    expect(
      splitLegalText("https://policiesXgoogleXcom/privacy", links).every((s) => s.type === "text"),
    ).toBe(true);
  });
});

describe("プライバシーポリシーの本文", () => {
  // ページの本文を書き直して、リンクにする文字が消えると、リンクが黙って押せなくなる
  // (page.tsx は default export しか出せないので、ファイルの文字で確かめる)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const source = fs.readFileSync(`${process.cwd()}/app/(marketing)/privacy/page.tsx`, "utf8");

  test.each([
    "（https://policies.google.com/privacy）",
    "（https://tools.google.com/dlpage/gaoptout）",
    "（https://x.com/ja/privacy）",
    "（https://help.x.com/ja/safety-and-security/privacy-controls-for-tailored-ads）",
    "「利用者情報の外部送信について」をご覧ください",
    "External Transmission of User Information page",
  ])("本文に「%s」がある", (text) => {
    expect(source).toContain(text);
  });
});
