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
