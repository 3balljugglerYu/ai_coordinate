/** @jest-environment node */

/**
 * Client Component が使う i18n 名前空間が、**クライアントへ配られているか**。
 *
 * ⭐ `i18n/messages.ts` の `clientNamespaces` は明示的な許可リストで、
 * 入れ忘れても**型は通る**（名前空間の部分集合を許す配列なので）。
 * 入れ忘れると `useTranslations("userStyles")` が解決できず、
 * **キー名がそのまま画面に出る**（"userStyles.chipAll" / "👑 userStyles.chipUsage"）。
 *
 * これはモックを挟むコンポーネントテストでは絶対に検出できない
 * （テストは next-intl をモックするため）。実際に起きたので、実物で検査する。
 */

import fs from "node:fs";
import path from "node:path";
import { getClientMessages } from "@/i18n/messages";
import { locales } from "@/i18n/config";
import { getAllMessages } from "@/i18n/messages";

/** /user-styles の Client Component。増えたらここに足す。 */
const CLIENT_COMPONENTS = [
  "features/user-styles/components/UserStylesFeedClient.tsx",
  "features/user-styles/components/UserStyleChips.tsx",
  "features/style-presets/components/OriginalKindTabs.tsx",
];

/** ソースから `useTranslations("x")` の名前空間を拾う。 */
function usedNamespaces(relativePath: string): string[] {
  const source = fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8"
  );
  return Array.from(
    source.matchAll(/useTranslations\(\s*["'`]([^"'`]+)["'`]\s*\)/g),
    (match) => match[1]
  );
}

describe("client bundle の i18n 名前空間", () => {
  test("スキャン対象のコンポーネントが実在する（パスの書き間違いで空振りしない）", () => {
    for (const file of CLIENT_COMPONENTS) {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
    }
  });

  test("いずれかのコンポーネントが名前空間を使っている（正規表現の空振り検知）", () => {
    const all = CLIENT_COMPONENTS.flatMap(usedNamespaces);
    expect(all.length).toBeGreaterThan(0);
  });

  test.each(CLIENT_COMPONENTS)(
    "%s が使う名前空間はクライアントへ配られている",
    async (file) => {
      const messages = await getClientMessages("ja");
      for (const namespace of usedNamespaces(file)) {
        expect(Object.keys(messages)).toContain(namespace);
      }
    }
  );

  /*
    ⭐ 15ロケールすべてに配る。1つでも欠けると、その言語だけキー名が出る。
  */
  test.each(locales)("%s にも userStyles が配られている", async (locale) => {
    const messages = await getClientMessages(locale);
    expect(messages).toHaveProperty("userStyles");
    expect((messages as Record<string, Record<string, string>>).userStyles)
      .toHaveProperty("chipAll");
  });
});

/*
  ⭐ 👑 のチップは `/styles` の「👑人気」と**同じ語彙**にする。
  トグルで棚を切り替えたときに、同じ意味のチップが別の言葉で出ると
  「違う絞り込みなのか」と読めてしまう。

  ⭐ ただし**注記は別物**。`/styles` は「直近30日の利用回数順」、こちらは窓なしの
  累計なので、あちらの文言を流用してはいけない（計画書 ADR-007）。
*/
describe("👑 チップの文言", () => {
  test.each(locales)("%s で /styles の人気チップと一致する", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.userStyles.chipUsage).toBe(messages.style.styleChipPopular);
  });

  test.each(locales)("%s の注記は /styles のものを流用していない", async (locale) => {
    const messages = await getAllMessages(locale);

    expect(messages.userStyles.usageSortNote).not.toBe(
      messages.style.stylePopularSortNote
    );
  });
});
