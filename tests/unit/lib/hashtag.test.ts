/** @jest-environment node */

import {
  buildHashtagSearchHref,
  extractHashtags,
  HASHTAG_MAX_LENGTH,
  HASHTAG_MAX_PER_POST,
  normalizeHashtag,
  tokenizeWithHashtags,
} from "@/lib/hashtag";

/** テストの可読性のため、表示名だけを取り出す。 */
function names(text: string): string[] {
  return extractHashtags(text).map((tag) => tag.name);
}

describe("hashtag", () => {
  // 計画書「タグの規則」表の 5 例。X の実機で確認した挙動そのもの。
  // ここが崩れたら他のテストが通っていても仕様から外れている。
  describe("X 実機で確認した規則（正本）", () => {
    test("アンダースコアはタグの一部になる", () => {
      expect(names("#冬服_みきふく")).toEqual(["冬服_みきふく"]);
    });

    test("`#` が続くと前のタグごと無効になる", () => {
      expect(names("#冬服#みきふく")).toEqual([]);
      expect(tokenizeWithHashtags("#冬服#みきふく")).toEqual([
        { type: "text", value: "#冬服#みきふく" },
      ]);
    });

    test("間にスペースがあれば2つのタグになる", () => {
      expect(names("#冬服 #みきふく")).toEqual(["冬服", "みきふく"]);
    });

    test("タグに使えない文字はそこで終端する", () => {
      expect(names("#冬服、かわいい")).toEqual(["冬服"]);
    });

    test("大文字小文字は同じタグとして扱う", () => {
      const tags = extractHashtags("#AI と #ai");
      expect(tags).toHaveLength(1);
      expect(tags[0]).toEqual({ name: "AI", normalized: "ai" });
    });
  });

  describe("extractHashtags", () => {
    test("タグが無いテキストは空配列", () => {
      expect(names("今日のコーデです")).toEqual([]);
      expect(names("")).toEqual([]);
    });

    test("文中・文末のタグも拾う", () => {
      expect(names("今日は #冬服 で出かけた #お出かけ")).toEqual([
        "冬服",
        "お出かけ",
      ]);
    });

    test("改行で区切られたタグを拾う", () => {
      expect(names("コーデ\n#冬服\n#ニット")).toEqual(["冬服", "ニット"]);
    });

    test("全角 ＃ でもタグになる", () => {
      expect(names("＃冬服")).toEqual(["冬服"]);
    });

    test("重複は畳んで初出の表記を残す", () => {
      const tags = extractHashtags("#Ai #ai #AI");
      expect(tags).toEqual([{ name: "Ai", normalized: "ai" }]);
    });

    test("直前が文字ならタグにしない", () => {
      expect(names("abc#冬服")).toEqual([]);
      expect(names("あいう#冬服")).toEqual([]);
      expect(names("2024#冬服")).toEqual([]);
    });

    test("直前が記号ならタグになる", () => {
      expect(names("(#冬服)")).toEqual(["冬服"]);
      expect(names("「#冬服」")).toEqual(["冬服"]);
      expect(names("🎀#冬服")).toEqual(["冬服"]);
    });

    test("HTML 実体参照はタグにしない", () => {
      expect(names("&#39;")).toEqual([]);
    });

    test("`#` が連続する場合はどちらもタグにならない", () => {
      expect(names("##冬服")).toEqual([]);
    });

    test("全数字のタグは無効", () => {
      expect(names("#123")).toEqual([]);
      expect(names("#１２３")).toEqual([]);
    });

    test("記号だけのタグは無効", () => {
      expect(names("#_")).toEqual([]);
      expect(names("#___")).toEqual([]);
    });

    test("数字と文字が混ざればタグになる", () => {
      expect(names("#冬服2024")).toEqual(["冬服2024"]);
      expect(names("#_冬服")).toEqual(["_冬服"]);
    });

    test("URL のフラグメントをタグにしない", () => {
      expect(names("https://example.com/page#section")).toEqual([]);
    });
  });

  describe("多言語（15 ロケール対応）", () => {
    test.each([
      ["韓国語", "#겨울옷", "겨울옷"],
      ["タイ語", "#เสื้อหนาว", "เสื้อหนาว"],
      ["ヒンディー語", "#सर्दी", "सर्दी"],
      ["アラビア語", "#شتاء", "شتاء"],
      ["中国語", "#冬装", "冬装"],
      ["長音記号", "#ニットセーター", "ニットセーター"],
      ["結合文字", "#café", "café"],
    ])("%s のタグを拾う", (_label, input, expected) => {
      expect(names(input)).toEqual([expected]);
    });

    test("半角カナは NFKC で全角に畳んで同一視する", () => {
      const halfWidth = extractHashtags("#ﾆｯﾄ");
      expect(halfWidth).toHaveLength(1);
      expect(halfWidth[0].name).toBe("ﾆｯﾄ"); // 表示は書かれたまま
      expect(halfWidth[0].normalized).toBe("ニット");
      expect(extractHashtags("#ニット")[0].normalized).toBe("ニット");
    });

    test("全角英字は NFKC で半角に畳む", () => {
      expect(normalizeHashtag("ＡＩ")).toBe("ai");
    });
  });

  describe("上限", () => {
    test("50 文字までのタグは有効", () => {
      const name = "あ".repeat(HASHTAG_MAX_LENGTH);
      expect(names(`#${name}`)).toEqual([name]);
    });

    test("50 文字を超えるタグは黙って無視する", () => {
      const name = "あ".repeat(HASHTAG_MAX_LENGTH + 1);
      expect(names(`#${name}`)).toEqual([]);
      expect(tokenizeWithHashtags(`#${name}`)).toEqual([
        { type: "text", value: `#${name}` },
      ]);
    });

    test("1 投稿 10 個まで。超過分は黙って無視する", () => {
      const text = Array.from(
        { length: HASHTAG_MAX_PER_POST + 3 },
        (_, i) => `#タグ${String.fromCharCode(97 + i)}`,
      ).join(" ");
      expect(names(text)).toHaveLength(HASHTAG_MAX_PER_POST);
      expect(names(text)[0]).toBe("タグa");
    });

    test("同じタグの繰り返しは上限を消費しない", () => {
      const text = `${"#冬服 ".repeat(15)}#ニット`;
      expect(names(text)).toEqual(["冬服", "ニット"]);
    });

    test("上限超過のタグは着色もしない（保存と表示を一致させる）", () => {
      const text = Array.from(
        { length: HASHTAG_MAX_PER_POST + 1 },
        (_, i) => `#タグ${String.fromCharCode(97 + i)}`,
      ).join(" ");
      const tokens = tokenizeWithHashtags(text);
      expect(tokens.filter((t) => t.type === "hashtag")).toHaveLength(
        HASHTAG_MAX_PER_POST,
      );
      expect(tokens[tokens.length - 1]).toEqual({
        type: "text",
        value: " #タグk",
      });
    });
  });

  describe("tokenizeWithHashtags", () => {
    test("テキストとタグを出現順に返す", () => {
      expect(tokenizeWithHashtags("今日は #冬服 です")).toEqual([
        { type: "text", value: "今日は " },
        {
          type: "hashtag",
          name: "冬服",
          normalized: "冬服",
          rawValue: "#冬服",
        },
        { type: "text", value: " です" },
      ]);
    });

    test("全角 ＃ は原文のまま返す（表示を書き換えない）", () => {
      const tokens = tokenizeWithHashtags("＃冬服");
      expect(tokens).toEqual([
        {
          type: "hashtag",
          name: "冬服",
          normalized: "冬服",
          rawValue: "＃冬服",
        },
      ]);
    });

    test("トークンを連結すると元のテキストに戻る", () => {
      const text = "a #冬服#ニット b ＃AI c #123 d #お出かけ";
      const joined = tokenizeWithHashtags(text)
        .map((token) => (token.type === "text" ? token.value : token.rawValue))
        .join("");
      expect(joined).toBe(text);
    });

    test("空文字は空配列", () => {
      expect(tokenizeWithHashtags("")).toEqual([]);
    });

    test("タグが無ければ text トークン1つ", () => {
      expect(tokenizeWithHashtags("ただの本文")).toEqual([
        { type: "text", value: "ただの本文" },
      ]);
    });

    test("抽出と着色の結果が一致する", () => {
      const text = "#冬服 #冬服#ニット ＃AI #ai #123";
      const tokenNames = new Set(
        tokenizeWithHashtags(text)
          .filter((token) => token.type === "hashtag")
          .map((token) => token.normalized),
      );
      expect([...tokenNames]).toEqual(
        extractHashtags(text).map((tag) => tag.normalized),
      );
    });
  });

  describe("buildHashtagSearchHref", () => {
    test("/search へ飛ばす", () => {
      expect(buildHashtagSearchHref("冬服")).toBe(
        `/search?q=${encodeURIComponent("#冬服")}`,
      );
    });

    test("書かれたままの表記を載せる（小文字に潰さない）", () => {
      // 正規化キーを載せると、押した先の検索ボックスが #perstaai になり、
      // 自分が書いた見た目が勝手に崩れる。一致は検索側が正規化して行う
      expect(buildHashtagSearchHref("PerstaAI")).toBe(
        `/search?q=${encodeURIComponent("#PerstaAI")}`,
      );
    });

    test("記号を含むタグでもクエリが壊れない", () => {
      expect(buildHashtagSearchHref("冬服_みきふく")).toBe(
        "/search?q=%23%E5%86%AC%E6%9C%8D_%E3%81%BF%E3%81%8D%E3%81%B5%E3%81%8F",
      );
    });
  });
});
