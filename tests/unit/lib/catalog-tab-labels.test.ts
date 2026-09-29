/**
 * カタログのタブと「カタログをつくる」の文言。
 *
 * ⭐ タブの中の名前(英語。Persta ORIGINAL / User ORIGINAL / CREATE)は全言語で同じにする。
 * フィードの引用元カードと同じ語彙で、翻訳すると「棚の名前」と「カードの名前」が
 * 食い違う(messages/ja.ts の userStyles のコメント)。
 * ただしタブの「Persta ORIGINAL」は、タブに入れるために短くした(2026-09-29 ユーザー指示)。
 * フィードの引用元カードは、一般の利用者には「Persta.AI ORIGINAL」のまま出し、
 * カタログ刷新後(公開前は運営だけ)はタブの名前をそのまま使う(FeedSourceQuote)。
 * ⭐ 刷新後の投稿のラベルは、作った本人のものは「〜 ORIGINAL」、それを使って
 * 作ったものは「with 〜」(2026-09-29 ユーザー決定)。
 * ⭐ タブの名前は「誰が届けるか」だけで分け、よし悪しの差をつけない
 * (docs/planning/catalog-three-tabs-implementation-plan.md ADR-008)。
 */

import { locales } from "@/i18n/config";
import { getAllMessages } from "@/i18n/messages";

describe("カタログのタブの文言", () => {
  test.each(locales)("%s: タブの中の名前(英語)は全言語で同じ", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.userStyles.tabOfficial).toBe("Persta ORIGINAL");
    expect(messages.userStyles.tabUser).toBe("User ORIGINAL");
    expect(messages.userStyles.tabCreate).toBe("CREATE");
  });

  // ⭐ 一般の利用者に見えるフィードの引用元カードの名前は、タブの名前を短くしても変えない
  test.each(locales)("%s: フィードの引用元カードの名前は今のまま", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.posts.feedQuoteStyleTitle).toBe("Persta.AI ORIGINAL");
    expect(messages.posts.feedQuoteDerivedTitle).toBe("ORIGINAL");
  });

  test.each(locales)(
    "%s: 刷新後の投稿のラベルは、タブの名前(使って作ったものは with 付き)",
    async (locale) => {
      const messages = await getAllMessages(locale);

      expect(messages.posts.modeWithPerstaOriginal).toBe(
        `with ${messages.userStyles.tabOfficial}`
      );
      expect(messages.posts.modeWithUserOriginal).toBe(`with ${messages.userStyles.tabUser}`);
      expect(messages.posts.modeUserOriginal).toBe(messages.userStyles.tabUser);
    }
  );

  test.each(locales)("%s: 刷新後の生成シートの見出しに、タブの名前が入っている", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.free.catalogSheetTitle).toContain(messages.userStyles.tabUser);
    expect(messages.style.catalogSheetTitle).toContain(messages.userStyles.tabOfficial);
    expect(messages.free.catalogSheetDescription.trim()).not.toBe("");
  });

  test.each(locales)(
    "%s: ページの見出し(タブごとの名前)と「カタログをつくる」の説明がそろっている",
    async (locale) => {
      const messages = await getAllMessages(locale);

      for (const text of [
        messages.userStyles.tabOfficialTitle,
        messages.userStyles.tabUserTitle,
        messages.userStyles.tabCreateTitle,
        messages.free.catalogCreateListed,
        messages.free.catalogCreateFollowers,
        messages.free.catalogCreateReward,
      ]) {
        expect(typeof text).toBe("string");
        expect(text.trim()).not.toBe("");
      }
    }
  );

  /*
    ⭐ 還元の額は運営が変える(0 で停止もある)。額は書かず、「還元されます」までにする。
    文言はそのまま表示するので、数字や差し込み用の {…} が入っていないことを確かめる。
  */
  test.each(locales)("%s: 還元の一文に額(数字)や差し込みを入れない", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.free.catalogCreateReward).not.toMatch(/[0-9０-９{}]/);
  });

  test("日本語の見出しは、決めた名前どおり", async () => {
    const messages = await getAllMessages("ja");

    expect(messages.userStyles.tabOfficialTitle).toBe("ペルスタのカタログ");
    expect(messages.userStyles.tabUserTitle).toBe("みんなのカタログ");
    expect(messages.userStyles.tabCreateTitle).toBe("カタログをつくる");
  });

  test("日本語の生成シートの見出しは「〜でつくる」", async () => {
    const messages = await getAllMessages("ja");

    expect(messages.free.catalogSheetTitle).toBe("User ORIGINAL でつくる");
    expect(messages.style.catalogSheetTitle).toBe("Persta ORIGINAL でつくる");
  });
});
