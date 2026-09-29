/**
 * カタログのタブと「カタログをつくる」の文言。
 *
 * ⭐ 英語の2段目(Persta.AI ORIGINAL / User ORIGINAL / CREATE)は全言語で同じにする。
 * フィードの引用元カードと同じ語彙で、翻訳すると「棚の名前」と「カードの名前」が
 * 食い違う(messages/ja.ts の userStyles のコメント)。
 * ⭐ タブの名前は「誰が届けるか」だけで分け、よし悪しの差をつけない
 * (docs/planning/catalog-three-tabs-implementation-plan.md ADR-008)。
 */

import { locales } from "@/i18n/config";
import { getAllMessages } from "@/i18n/messages";

describe("カタログのタブの文言", () => {
  test.each(locales)("%s: 英語の2段目は全言語で同じ", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.userStyles.tabOfficial).toBe("Persta.AI ORIGINAL");
    expect(messages.userStyles.tabUser).toBe("User ORIGINAL");
    expect(messages.userStyles.tabCreate).toBe("CREATE");
  });

  test.each(locales)(
    "%s: タブの見出しと「カタログをつくる」の説明がそろっている",
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
});
