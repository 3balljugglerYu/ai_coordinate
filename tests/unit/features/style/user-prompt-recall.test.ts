/**
 * features/style/lib/user-prompt-recall のテスト。
 *
 * jest の jsdom 環境では window.localStorage がデフォルトで使えるので、
 * 各テスト前に localStorage.clear() してから検証する。
 */
import {
  loadUserPromptForCategory,
  saveUserPromptForCategory,
} from "@/features/style/lib/user-prompt-recall";

describe("user-prompt-recall", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("loadUserPromptForCategory", () => {
    test("未保存 category は空文字を返す", () => {
      expect(loadUserPromptForCategory("collectible_wafer_sticker", 200)).toBe(
        "",
      );
    });

    test("保存済み category の値が返る", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "ハイビスカスを持たせて",
      );
      expect(loadUserPromptForCategory("collectible_wafer_sticker", 200)).toBe(
        "ハイビスカスを持たせて",
      );
    });

    test("maxLength を超える値は slice される (admin が後から縮めた保険)", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "0123456789",
      );
      expect(loadUserPromptForCategory("collectible_wafer_sticker", 5)).toBe(
        "01234",
      );
    });

    test("maxLength が null / undefined / 0 のときは無制限扱いで全文を返す", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "fulltext",
      );
      expect(loadUserPromptForCategory("collectible_wafer_sticker", null)).toBe(
        "fulltext",
      );
      expect(
        loadUserPromptForCategory("collectible_wafer_sticker", undefined),
      ).toBe("fulltext");
      expect(loadUserPromptForCategory("collectible_wafer_sticker", 0)).toBe(
        "fulltext",
      );
    });

    test("category 単位で独立して取り出す (別 category は混ざらない)", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "wafer-text",
      );
      window.localStorage.setItem("user-prompt:chibi", "chibi-text");
      expect(loadUserPromptForCategory("collectible_wafer_sticker", 200)).toBe(
        "wafer-text",
      );
      expect(loadUserPromptForCategory("chibi", 200)).toBe("chibi-text");
    });

    test("localStorage が throw しても空文字に fallback (private mode の保険)", () => {
      const spy = jest
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });
      expect(loadUserPromptForCategory("collectible_wafer_sticker", 200)).toBe(
        "",
      );
      spy.mockRestore();
    });
  });

  describe("saveUserPromptForCategory", () => {
    test("非空の値は category キーで保存される", () => {
      saveUserPromptForCategory("collectible_wafer_sticker", "アロハシャツで");
      expect(
        window.localStorage.getItem("user-prompt:collectible_wafer_sticker"),
      ).toBe("アロハシャツで");
    });

    test("空文字 / trim 後空文字は保存ではなく削除", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "old",
      );
      saveUserPromptForCategory("collectible_wafer_sticker", "");
      expect(
        window.localStorage.getItem("user-prompt:collectible_wafer_sticker"),
      ).toBeNull();

      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "old2",
      );
      saveUserPromptForCategory("collectible_wafer_sticker", "   \n\t  ");
      expect(
        window.localStorage.getItem("user-prompt:collectible_wafer_sticker"),
      ).toBeNull();
    });

    test("category 単位で独立 (別 category の保存値は触らない)", () => {
      window.localStorage.setItem("user-prompt:chibi", "keep-me");
      saveUserPromptForCategory(
        "collectible_wafer_sticker",
        "new-wafer",
      );
      expect(window.localStorage.getItem("user-prompt:chibi")).toBe("keep-me");
      expect(
        window.localStorage.getItem("user-prompt:collectible_wafer_sticker"),
      ).toBe("new-wafer");
    });

    test("localStorage が throw しても例外を吐かない", () => {
      const spy = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("quota_exceeded");
        });
      expect(() =>
        saveUserPromptForCategory("collectible_wafer_sticker", "x"),
      ).not.toThrow();
      spy.mockRestore();
    });
  });
});
