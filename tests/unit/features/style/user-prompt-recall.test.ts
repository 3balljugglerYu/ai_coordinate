/**
 * features/style/lib/user-prompt-recall のテスト。
 *
 * jest の jsdom 環境では window.localStorage がデフォルトで使えるので、
 * 各テスト前に localStorage.clear() してから検証する。
 *
 * 記憶キーはスコープで決まる:
 *   - hasPresetLabel=false → user-prompt:{categoryKey} (従来キー = 後方互換)
 *   - hasPresetLabel=true  → user-prompt:preset:{presetId}
 */
import {
  loadUserPromptForScope,
  saveUserPromptForScope,
  type UserPromptRecallScope,
} from "@/features/style/lib/user-prompt-recall";

const waferScope: UserPromptRecallScope = {
  presetId: "preset-wafer-1",
  hasPresetLabel: false,
  categoryKey: "collectible_wafer_sticker",
};

const labeledScope: UserPromptRecallScope = {
  presetId: "preset-name-1",
  hasPresetLabel: true,
  categoryKey: "character_remix_text",
};

describe("user-prompt-recall", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("loadUserPromptForScope", () => {
    test("未保存 scope は空文字を返す", () => {
      expect(loadUserPromptForScope(waferScope, 200)).toBe("");
    });

    test("保存済み category scope の値が返る (従来キー互換)", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "ハイビスカスを持たせて",
      );
      expect(loadUserPromptForScope(waferScope, 200)).toBe(
        "ハイビスカスを持たせて",
      );
    });

    test("maxLength を超える値は slice される (admin が後から縮めた保険)", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "0123456789",
      );
      expect(loadUserPromptForScope(waferScope, 5)).toBe("01234");
    });

    test("maxLength が null / undefined / 0 のときは無制限扱いで全文を返す", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "fulltext",
      );
      expect(loadUserPromptForScope(waferScope, null)).toBe("fulltext");
      expect(loadUserPromptForScope(waferScope, undefined)).toBe("fulltext");
      expect(loadUserPromptForScope(waferScope, 0)).toBe("fulltext");
    });

    test("category 単位で独立して取り出す (別 category は混ざらない)", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "wafer-text",
      );
      window.localStorage.setItem("user-prompt:chibi", "chibi-text");
      expect(loadUserPromptForScope(waferScope, 200)).toBe("wafer-text");
      expect(
        loadUserPromptForScope(
          { presetId: "p-chibi", hasPresetLabel: false, categoryKey: "chibi" },
          200,
        ),
      ).toBe("chibi-text");
    });

    test("hasPresetLabel=true は preset キーから読む (category の下書きは prefill しない)", () => {
      // 同カテゴリの category キーに下書きがあっても、ラベル上書きのある preset は
      // 「入力の意味が違う」ため category の下書きを引き継がない。
      window.localStorage.setItem(
        "user-prompt:character_remix_text",
        "カテゴリの下書き",
      );
      expect(loadUserPromptForScope(labeledScope, 200)).toBe("");

      window.localStorage.setItem(
        "user-prompt:preset:preset-name-1",
        "ラッキー",
      );
      expect(loadUserPromptForScope(labeledScope, 200)).toBe("ラッキー");
    });

    test("hasPresetLabel=true の preset 同士も presetId 単位で独立する", () => {
      window.localStorage.setItem("user-prompt:preset:preset-name-1", "名前A");
      const numberScope: UserPromptRecallScope = {
        presetId: "preset-number-1",
        hasPresetLabel: true,
        categoryKey: "character_remix_text",
      };
      expect(loadUserPromptForScope(numberScope, 200)).toBe("");
      expect(loadUserPromptForScope(labeledScope, 200)).toBe("名前A");
    });

    test("localStorage が throw しても空文字に fallback (private mode の保険)", () => {
      const spy = jest
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });
      expect(loadUserPromptForScope(waferScope, 200)).toBe("");
      spy.mockRestore();
    });
  });

  describe("saveUserPromptForScope", () => {
    test("hasPresetLabel=false は従来の category キーで保存される", () => {
      saveUserPromptForScope(waferScope, "アロハシャツで");
      expect(
        window.localStorage.getItem("user-prompt:collectible_wafer_sticker"),
      ).toBe("アロハシャツで");
    });

    test("hasPresetLabel=true は preset キーで保存され、category キーは触らない", () => {
      window.localStorage.setItem(
        "user-prompt:character_remix_text",
        "カテゴリの下書き",
      );
      saveUserPromptForScope(labeledScope, "ラッキー");
      expect(
        window.localStorage.getItem("user-prompt:preset:preset-name-1"),
      ).toBe("ラッキー");
      expect(
        window.localStorage.getItem("user-prompt:character_remix_text"),
      ).toBe("カテゴリの下書き");
    });

    test("空文字 / trim 後空文字は保存ではなく削除", () => {
      window.localStorage.setItem(
        "user-prompt:collectible_wafer_sticker",
        "old",
      );
      saveUserPromptForScope(waferScope, "");
      expect(
        window.localStorage.getItem("user-prompt:collectible_wafer_sticker"),
      ).toBeNull();

      window.localStorage.setItem(
        "user-prompt:preset:preset-name-1",
        "old2",
      );
      saveUserPromptForScope(labeledScope, "   \n\t  ");
      expect(
        window.localStorage.getItem("user-prompt:preset:preset-name-1"),
      ).toBeNull();
    });

    test("category 単位で独立 (別 category の保存値は触らない)", () => {
      window.localStorage.setItem("user-prompt:chibi", "keep-me");
      saveUserPromptForScope(waferScope, "new-wafer");
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
      expect(() => saveUserPromptForScope(waferScope, "x")).not.toThrow();
      spy.mockRestore();
    });
  });
});
