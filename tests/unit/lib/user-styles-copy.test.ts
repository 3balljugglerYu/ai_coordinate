/**
 * みんなのカタログ（User ORIGINAL、/user-styles）の画面に出る説明文。
 *
 * ⭐ 「Free Style で生成した作品」ではなく「CREATE で生成した作品」と書く。カタログ刷新では
 * Free Style は「カタログをつくる（CREATE）」のタブになったため（2026-09-29 ユーザー指示）。
 * 検索結果に出る説明（indexDescription）は画面に出ないので変えていない。
 */

import { locales } from "@/i18n/config";
import { getUserStylesCopy } from "@/i18n/page-copy";

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
