import { getAllMessages, getClientMessages } from "@/i18n/messages";
import { enMessages } from "@/messages/en";
import { jaMessages } from "@/messages/ja";

const expectedClientNamespaces = [
  "accountManagement",
  "avatarUpload",
  "auth",
  "challenge",
  "common",
  "coordinate",
  "contact",
  "credits",
  "moderation",
  "nav",
  "footer",
  "follow",
  "i2iPoc",
  "myPage",
  "notifications",
  "profileEdit",
  "referral",
  "searchBar",
  "posts",
  "tutorial",
] as const;

function collectLeafPaths(
  value: unknown,
  parentPath = ""
): string[] {
  if (typeof value !== "object" || value === null) {
    return parentPath ? [parentPath] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, nestedValue]) => {
      const nextPath = parentPath ? `${parentPath}.${key}` : key;
      return collectLeafPaths(nestedValue, nextPath);
    }
  );
}

describe("TranslationMessages unit tests from EARS specs", () => {
  describe("TMSG-001 getAllMessages", () => {
    test("getAllMessages_jaロケールの場合_日本語カタログを返す", async () => {
      await expect(getAllMessages("ja")).resolves.toEqual(jaMessages);
    });

    test("getAllMessages_enロケールの場合_英語カタログを返す", async () => {
      await expect(getAllMessages("en")).resolves.toEqual(enMessages);
    });
  });

  describe("TMSG-002 getAllMessages", () => {
    test("getAllMessages_両localeの場合_同じトップレベルnamespaceを持つ", async () => {
      const [jaCatalog, enCatalog] = await Promise.all([
        getAllMessages("ja"),
        getAllMessages("en"),
      ]);

      expect(Object.keys(jaCatalog).sort()).toEqual(Object.keys(enCatalog).sort());
    });

    test("getAllMessages_両localeの場合_同じネスト翻訳キーパスを持つ", async () => {
      const [jaCatalog, enCatalog] = await Promise.all([
        getAllMessages("ja"),
        getAllMessages("en"),
      ]);

      expect(collectLeafPaths(jaCatalog).sort()).toEqual(
        collectLeafPaths(enCatalog).sort()
      );
    });
  });

  describe("TMSG-003 getClientMessages", () => {
    test("getClientMessages_jaロケールの場合_日本語clientカタログを返す", async () => {
      const clientCatalog = await getClientMessages("ja");

      expect(clientCatalog.common.appName).toBe(jaMessages.common.appName);
      expect(clientCatalog.posts.newest).toBe(jaMessages.posts.newest);
      expect(clientCatalog.notifications.pageTitle).toBe(
        jaMessages.notifications.pageTitle
      );
    });

    test("getClientMessages_enロケールの場合_英語clientカタログを返す", async () => {
      const clientCatalog = await getClientMessages("en");

      expect(clientCatalog.common.appName).toBe(enMessages.common.appName);
      expect(clientCatalog.posts.newest).toBe(enMessages.posts.newest);
      expect(clientCatalog.notifications.pageTitle).toBe(
        enMessages.notifications.pageTitle
      );
    });
  });

  describe("TMSG-004 getClientMessages", () => {
    test("getClientMessages_locale指定時_定義済みclient namespaceのみを返す", async () => {
      const [jaClientCatalog, enClientCatalog] = await Promise.all([
        getClientMessages("ja"),
        getClientMessages("en"),
      ]);

      const expectedNamespaces = [...expectedClientNamespaces].sort();

      expect(Object.keys(jaClientCatalog).sort()).toEqual(expectedNamespaces);
      expect(Object.keys(enClientCatalog).sort()).toEqual(expectedNamespaces);
    });

    test("getClientMessages_locale指定時_各namespaceが完全カタログsubsetと一致する", async () => {
      const [jaClientCatalog, enClientCatalog, jaCatalog, enCatalog] =
        await Promise.all([
          getClientMessages("ja"),
          getClientMessages("en"),
          getAllMessages("ja"),
          getAllMessages("en"),
        ]);

      for (const namespace of expectedClientNamespaces) {
        expect(jaClientCatalog[namespace]).toEqual(jaCatalog[namespace]);
        expect(enClientCatalog[namespace]).toEqual(enCatalog[namespace]);
      }
    });
  });
});
