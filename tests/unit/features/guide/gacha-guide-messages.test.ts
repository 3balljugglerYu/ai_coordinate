/**
 * ガチャ機能の紹介ページの文言(15言語)。
 *
 * 画面の名前({catalog} {toggle} など)はコードから差し込むので、訳で差し込み口が消えたり
 * 名前が変わったりすると、案内から画面の名前が抜け落ちる。言語ごとに差し込み口がそろっているかを確かめる。
 */

import { jaMessages } from "@/messages/ja";
import { enMessages } from "@/messages/en";
import { koMessages } from "@/messages/ko";
import { zhCnMessages } from "@/messages/zh-CN";
import { zhTwMessages } from "@/messages/zh-TW";
import { esMessages } from "@/messages/es";
import { ptMessages } from "@/messages/pt";
import { frMessages } from "@/messages/fr";
import { deMessages } from "@/messages/de";
import { itMessages } from "@/messages/it";
import { idMessages } from "@/messages/id";
import { thMessages } from "@/messages/th";
import { viMessages } from "@/messages/vi";
import { hiMessages } from "@/messages/hi";
import { arMessages } from "@/messages/ar";

const OTHERS = {
  en: enMessages,
  ko: koMessages,
  "zh-CN": zhCnMessages,
  "zh-TW": zhTwMessages,
  es: esMessages,
  pt: ptMessages,
  fr: frMessages,
  de: deMessages,
  it: itMessages,
  id: idMessages,
  th: thMessages,
  vi: viMessages,
  hi: hiMessages,
  ar: arMessages,
};

const placeholders = (text: string) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

describe("gachaGuide の文言", () => {
  const ja = jaMessages.gachaGuide as Record<string, string>;

  test.each(Object.keys(OTHERS) as (keyof typeof OTHERS)[])("%s: 日本語と同じキーと差し込み口がそろっている", (locale) => {
    const guide = OTHERS[locale].gachaGuide as Record<string, string>;
    expect(Object.keys(guide)).toEqual(Object.keys(ja));
    for (const key of Object.keys(ja)) {
      expect({ key, placeholders: placeholders(guide[key]) }).toEqual({
        key,
        placeholders: placeholders(ja[key]),
      });
      // 差し込み口のほかに波括弧を書かない(ICU の書式として読まれて表示が崩れる)
      expect(guide[key].replace(/\{[a-zA-Z]+\}/g, "")).not.toMatch(/[{}]/);
      // ASCII のアポストロフィは ICU の特殊文字(’ を使う)
      expect(guide[key]).not.toContain("'");
    }
  });
});
