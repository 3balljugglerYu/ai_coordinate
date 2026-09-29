/**
 * みんなのカタログ（User ORIGINAL、/user-styles）の画面に出る説明文。
 *
 * ⭐ 「Free Style で生成した作品」ではなく「CREATE で生成した作品」と書く。カタログ刷新では
 * Free Style は「カタログをつくる（CREATE）」のタブになったため（2026-09-29 ユーザー指示）。
 * 検索結果に出る説明（indexDescription）は画面に出ないので変えていない。
 */

import { locales } from "@/i18n/config";
import { getUserStylesCopy } from "@/i18n/page-copy";
import { getAllMessages } from "@/i18n/messages";

describe("みんなのカタログの説明文", () => {
  test("日本語は「CREATE で生成した作品」と書く", () => {
    const copy = getUserStylesCopy("ja");

    expect(copy.indexIntro).toBe(
      "ユーザーがCREATEで生成した作品一覧です！\n気に入ったものを生成できます。"
    );
    expect(copy.listingNote).toBe(
      "※CREATE で投稿された作品のうち、Before / After が載っているものを表示しています。"
    );
  });

  test.each(locales)("%s: 画面に出る説明文は Free Style ではなく CREATE と書く", (locale) => {
    const copy = getUserStylesCopy(locale);

    for (const text of [copy.indexIntro, copy.listingNote]) {
      expect(text).toContain("CREATE");
      expect(text).not.toMatch(/Free[ -]?Style|自由模式/i);
    }
  });
});

/*
  ⭐ /free を未ログインで開いたときの見出し。刷新後だけ「CREATE」にし、一般の利用者の
  見出し(free.loginCtaTitle)は今のまま「Free Style」。
*/
describe("カタログをつくる(/free)のログインの案内", () => {
  test("日本語は「CREATE はログインが必要です」", async () => {
    const messages = await getAllMessages("ja");

    expect(messages.free.loginCtaTitleCreate).toBe("CREATE はログインが必要です");
    expect(messages.free.loginCtaTitle).toBe("Free Style はログインが必要です");
  });

  test.each(locales)("%s: 刷新後の見出しは CREATE、一般の利用者の見出しは Free Style のまま", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.free.loginCtaTitleCreate).toContain("CREATE");
    expect(messages.free.loginCtaTitleCreate).not.toMatch(/Free[ -]?Style/i);
    expect(messages.free.loginCtaTitle).toContain("Free Style");
  });
});
