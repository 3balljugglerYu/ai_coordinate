/** @jest-environment jsdom */

import {
  BACKGROUND_MODE_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
  readPreferredBackgroundMode,
  readPreferredModel,
  writePreferredBackgroundMode,
  writePreferredModel,
} from "@/features/generation/lib/form-preferences";

describe("form-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("readPreferredModel", () => {
    it("returns default when nothing is stored", () => {
      expect(readPreferredModel()).toBe("gemini-3.1-flash-image-preview-512");
    });

    it("returns the stored value when it is a known persistable model", () => {
      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "gpt-image-2-low");
      expect(readPreferredModel()).toBe("gpt-image-2-low");
    });

    it("returns the stored value for each visible Gemini option", () => {
      const options = [
        "gemini-3.1-flash-image-preview-512",
        "gemini-3.1-flash-image-preview-1024",
        "gemini-3-pro-image-1k",
        "gemini-3-pro-image-2k",
        "gemini-3-pro-image-4k",
      ] as const;
      for (const value of options) {
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, value);
        expect(readPreferredModel()).toBe(value);
      }
    });

    it("falls back to default for unknown / legacy / empty values", () => {
      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "dall-e-3");
      expect(readPreferredModel()).toBe("gemini-3.1-flash-image-preview-512");

      // legacy ID (not in dropdown) も default に丸める
      window.localStorage.setItem(
        SELECTED_MODEL_STORAGE_KEY,
        "gemini-2.5-flash-image",
      );
      expect(readPreferredModel()).toBe("gemini-3.1-flash-image-preview-512");

      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "");
      expect(readPreferredModel()).toBe("gemini-3.1-flash-image-preview-512");
    });
  });

  describe("writePreferredModel", () => {
    it("persists known persistable models", () => {
      writePreferredModel("gpt-image-2-low");
      expect(window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(
        "gpt-image-2-low",
      );
    });

    it("ignores legacy IDs (not in the dropdown)", () => {
      // GeminiModel union 上は legacy 値も型チェックを通るが、UI に表示できない
      // 値を保存してもユーザーに不便を与えるだけなので write 側で弾く
      writePreferredModel("gemini-2.5-flash-image" as never);
      expect(window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBeNull();
    });
  });

  describe("readPreferredBackgroundMode", () => {
    it("returns default 'keep' when nothing is stored", () => {
      expect(readPreferredBackgroundMode()).toBe("keep");
    });

    it("returns each valid stored value", () => {
      const options = ["ai_auto", "include_in_prompt", "keep"] as const;
      for (const value of options) {
        window.localStorage.setItem(BACKGROUND_MODE_STORAGE_KEY, value);
        expect(readPreferredBackgroundMode()).toBe(value);
      }
    });

    it("falls back to default for unknown / empty values", () => {
      window.localStorage.setItem(
        BACKGROUND_MODE_STORAGE_KEY,
        "no_change",
      );
      expect(readPreferredBackgroundMode()).toBe("keep");

      window.localStorage.setItem(BACKGROUND_MODE_STORAGE_KEY, "");
      expect(readPreferredBackgroundMode()).toBe("keep");
    });
  });

  describe("writePreferredBackgroundMode", () => {
    it("persists known background modes", () => {
      writePreferredBackgroundMode("ai_auto");
      expect(window.localStorage.getItem(BACKGROUND_MODE_STORAGE_KEY)).toBe(
        "ai_auto",
      );

      writePreferredBackgroundMode("include_in_prompt");
      expect(window.localStorage.getItem(BACKGROUND_MODE_STORAGE_KEY)).toBe(
        "include_in_prompt",
      );
    });

    it("ignores unknown values", () => {
      writePreferredBackgroundMode("invalid" as never);
      expect(window.localStorage.getItem(BACKGROUND_MODE_STORAGE_KEY)).toBeNull();
    });
  });

  describe("safe write under storage failures", () => {
    it("does not throw when localStorage.setItem throws (e.g. quota)", () => {
      const original = window.localStorage.setItem;
      window.localStorage.setItem = jest.fn(() => {
        throw new Error("QuotaExceededError");
      });
      try {
        expect(() => writePreferredModel("gpt-image-2-low")).not.toThrow();
        expect(() => writePreferredBackgroundMode("ai_auto")).not.toThrow();
      } finally {
        window.localStorage.setItem = original;
      }
    });
  });
});
