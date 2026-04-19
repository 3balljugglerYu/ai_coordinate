/** @jest-environment node */

import { linkify } from "@/lib/linkify";

describe("linkify", () => {
  describe("正常系", () => {
    test("URL のみの場合_単一の link トークンを返す", () => {
      const tokens = linkify("https://example.com/path");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({
        type: "link",
        href: "https://example.com/path",
        rawValue: "https://example.com/path",
        displayValue: "example.com/path",
      });
    });

    test("テキストとURLが混在する場合_テキストとlinkを順に返す", () => {
      const tokens = linkify("see https://example.com/ here");
      expect(tokens).toEqual([
        { type: "text", value: "see " },
        {
          type: "link",
          href: "https://example.com/",
          rawValue: "https://example.com/",
          displayValue: "example.com",
        },
        { type: "text", value: " here" },
      ]);
    });

    test("複数のURLが含まれる場合_それぞれが独立したlinkトークンになる", () => {
      const tokens = linkify("a https://a.com b https://b.com c");
      expect(tokens.filter((t) => t.type === "link")).toHaveLength(2);
    });

    test("http と https の両方をリンク化する", () => {
      expect(linkify("http://example.com")[0].type).toBe("link");
      expect(linkify("https://example.com")[0].type).toBe("link");
    });

    test("www. をdisplayValueから除去する", () => {
      const [token] = linkify("https://www.example.com/path");
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.displayValue).toBe("example.com/path");
      }
    });

    test("rawValue は入力原文を保持する_hrefは正規化される", () => {
      const [token] = linkify("https://Example.COM");
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.rawValue).toBe("https://Example.COM");
        expect(token.href).toBe("https://example.com/");
      }
    });

    test("表示文字列が24文字の場合_切詰めない", () => {
      // "example.com/" (12) + "a".repeat(12) = 24 chars
      const url = "https://example.com/" + "a".repeat(12);
      const [token] = linkify(url);
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.displayValue).toBe("example.com/" + "a".repeat(12));
        expect(token.displayValue.length).toBe(24);
      }
    });

    test("表示文字列が25文字の場合_切詰めない", () => {
      // "example.com/" (12) + "a".repeat(13) = 25 chars
      const url = "https://example.com/" + "a".repeat(13);
      const [token] = linkify(url);
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.displayValue).toBe("example.com/" + "a".repeat(13));
        expect(token.displayValue.length).toBe(25);
      }
    });

    test("表示文字列が26文字の場合_24文字に切詰めて…を付加する", () => {
      // "example.com/" (12) + "a".repeat(14) = 26 chars → truncated
      const url = "https://example.com/" + "a".repeat(14);
      const [token] = linkify(url);
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.displayValue).toBe("example.com/" + "a".repeat(12) + "…");
        expect(token.displayValue.length).toBe(25);
      }
    });

    test("path が / のみの場合_displayValueはホスト名のみ", () => {
      const [token] = linkify("https://example.com/");
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.displayValue).toBe("example.com");
      }
    });

    test("query と hash も displayValue に含む", () => {
      const [token] = linkify("https://ex.com/p?q=1#h");
      expect(token.type).toBe("link");
      if (token.type === "link") {
        expect(token.displayValue).toBe("ex.com/p?q=1#h");
      }
    });
  });

  describe("異常系", () => {
    test("空文字列の場合_空配列を返す", () => {
      expect(linkify("")).toEqual([]);
    });

    test("URLを含まない場合_単一のtextトークンを返す", () => {
      expect(linkify("hello world")).toEqual([
        { type: "text", value: "hello world" },
      ]);
    });

    test("ftp スキームはリンク化しない", () => {
      const tokens = linkify("ftp://example.com");
      expect(tokens.every((t) => t.type === "text")).toBe(true);
    });

    test("javascript スキームはリンク化しない", () => {
      // URL_REGEX は https?:// しかマッチしないため text として素通りする
      const tokens = linkify("javascript:alert(1)");
      expect(tokens.every((t) => t.type === "text")).toBe(true);
    });

    test("パース不能なURL様文字列はtextとして扱う", () => {
      // new URL() で例外になるパターン（空ホスト）
      const tokens = linkify("https://");
      expect(tokens.every((t) => t.type === "text")).toBe(true);
    });

    test("URL_REGEXにマッチするがnew URLがthrowする場合_textトークンに戻す", () => {
      // 不正な IPv6 ブラケットは URL_REGEX にはマッチするが new URL() で例外
      const tokens = linkify("see https://[invalid end");
      const link = tokens.find((t) => t.type === "link");
      expect(link).toBeUndefined();
      // rawValue が text として残っていることを確認（safeParseHttpUrl の catch → linkify の else 経路）
      expect(tokens.some((t) => t.type === "text" && t.value.includes("https://[invalid"))).toBe(true);
    });

    test("末尾のピリオドは剥離してtextトークンに戻す", () => {
      const tokens = linkify("see https://example.com.");
      expect(tokens).toEqual([
        { type: "text", value: "see " },
        {
          type: "link",
          href: "https://example.com/",
          rawValue: "https://example.com",
          displayValue: "example.com",
        },
        { type: "text", value: "." },
      ]);
    });

    test("末尾の全角句点を剥離する", () => {
      const tokens = linkify("サイトはこちら https://example.com。");
      const link = tokens.find((t) => t.type === "link");
      const lastText = tokens[tokens.length - 1];
      expect(link?.type).toBe("link");
      if (link?.type === "link") {
        expect(link.rawValue).toBe("https://example.com");
      }
      expect(lastText).toEqual({ type: "text", value: "。" });
    });

    test("末尾の閉じ括弧を剥離する", () => {
      const tokens = linkify("(see https://example.com)");
      const lastText = tokens[tokens.length - 1];
      expect(lastText).toEqual({ type: "text", value: ")" });
    });

    test("URLの直後に日本語が続く場合_URLは日本語の手前で終わる", () => {
      const tokens = linkify("https://example.com、次は");
      const link = tokens.find((t) => t.type === "link");
      if (link?.type === "link") {
        expect(link.rawValue).toBe("https://example.com");
      }
      // 読点以降は1つのテキストトークンとして残る（URL_REGEX が非ASCIIで終端するため）
      expect(tokens[1]).toEqual({ type: "text", value: "、次は" });
    });
  });
});
