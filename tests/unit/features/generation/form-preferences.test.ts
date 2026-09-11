/** @jest-environment jsdom */

import { DEFAULT_GENERATION_MODEL } from "@/features/generation/types";
import {
  BACKGROUND_MODE_STORAGE_KEY,
  FORCED_GPT_IMAGE_2_5_KEY,
  MODEL_SWITCH_NOTICE_SEEN_KEY,
  markGptImage25Forced,
  markModelSwitchNoticeSeen,
  shouldForceGptImage25,
  shouldShowModelSwitchNotice,
  COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
  FREE_ASPECT_MODE_STORAGE_KEY,
  readCoordinateStockSavePromptDismissed,
  readPreferredBackgroundMode,
  readPreferredModel,
  readPreferredAspectMode,
  writeCoordinateStockSavePromptDismissed,
  writePreferredBackgroundMode,
  writePreferredModel,
  writePreferredAspectMode,
} from "@/features/generation/lib/form-preferences";
import { GPT_IMAGE_2_LEGACY_LOW_MODEL } from "@/features/generation/types";

describe("form-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("readPreferredModel", () => {
    it("returns default when nothing is stored", () => {
      expect(readPreferredModel()).toBe(DEFAULT_GENERATION_MODEL);
    });

    it("returns the stored value when it is a known persistable model", () => {
      // 保存値の尊重を見るテストなので、既定(2.5)ではなく保存した 2.0 が返る
      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "gpt-image-2-low-1k");
      expect(readPreferredModel()).toBe("gpt-image-2-low-1k");
    });

    it("migrates the legacy GPT Image 2 low value to the 1k canonical", () => {
      window.localStorage.setItem(
        SELECTED_MODEL_STORAGE_KEY,
        GPT_IMAGE_2_LEGACY_LOW_MODEL
      );

      // legacy 別名は 2.0 の canonical へ正規化される(既定の 2.5 にはしない)
      expect(readPreferredModel()).toBe("gpt-image-2-low-1k");
      expect(window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(
        "gpt-image-2-low-1k"
      );
    });

    it("returns the stored value for each GPT Image 2 size/quality option", () => {
      const options = [
        "gpt-image-2-low-1k",
        "gpt-image-2-low-2k",
        "gpt-image-2-low-4k",
        "gpt-image-2-medium-1k",
        "gpt-image-2-medium-2k",
        "gpt-image-2-medium-4k",
        "gpt-image-2-high-1k",
        "gpt-image-2-high-2k",
        "gpt-image-2-high-4k",
      ] as const;
      for (const value of options) {
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, value);
        expect(readPreferredModel()).toBe(value);
      }
    });

    it("returns the stored value for each ChatGPT Images 2.5 option", () => {
      // 2.5 は段階公開中だが localStorage への保存は許す。非運営に復元されても
      // resolveEffectiveModelForAuthState が既定モデルへ丸める（REQ-014）。
      const options = [
        "gpt-image-2.5-flare-low-1k",
        "gpt-image-2.5-flare-low-2k",
        "gpt-image-2.5-flare-low-4k",
        "gpt-image-2.5-flare-medium-1k",
        "gpt-image-2.5-flare-medium-2k",
        "gpt-image-2.5-flare-medium-4k",
        "gpt-image-2.5-flare-high-1k",
        "gpt-image-2.5-flare-high-2k",
        "gpt-image-2.5-flare-high-4k",
      ] as const;
      for (const value of options) {
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, value);
        expect(readPreferredModel()).toBe(value);
      }
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
      expect(readPreferredModel()).toBe(DEFAULT_GENERATION_MODEL);

      // legacy ID (not in dropdown) も default に丸める
      window.localStorage.setItem(
        SELECTED_MODEL_STORAGE_KEY,
        "gemini-2.5-flash-image",
      );
      expect(readPreferredModel()).toBe(DEFAULT_GENERATION_MODEL);

      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "");
      expect(readPreferredModel()).toBe(DEFAULT_GENERATION_MODEL);
    });
  });

  describe("2.5 への1回だけの切り替え / 案内の既読", () => {
    it("初回は切り替え対象。記録すると2度目以降は対象外になる", () => {
      expect(shouldForceGptImage25()).toBe(true);
      markGptImage25Forced();
      expect(shouldForceGptImage25()).toBe(false);
      expect(window.localStorage.getItem(FORCED_GPT_IMAGE_2_5_KEY)).toBe("1");
    });

    it("初回は案内対象。既読にすると2度目以降は出さない", () => {
      expect(shouldShowModelSwitchNotice()).toBe(true);
      markModelSwitchNoticeSeen();
      expect(shouldShowModelSwitchNotice()).toBe(false);
      expect(window.localStorage.getItem(MODEL_SWITCH_NOTICE_SEEN_KEY)).toBe(
        "1"
      );
    });

    it("⭐ localStorage が読めない環境では切り替えない（毎回選択を奪わないため）", () => {
      const getItem = jest
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("denied");
        });
      try {
        expect(shouldForceGptImage25()).toBe(false);
        expect(shouldShowModelSwitchNotice()).toBe(false);
      } finally {
        getItem.mockRestore();
      }
    });

    it("書き込めない環境でも例外にしない", () => {
      const setItem = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("quota");
        });
      try {
        expect(() => markGptImage25Forced()).not.toThrow();
        expect(() => markModelSwitchNoticeSeen()).not.toThrow();
      } finally {
        setItem.mockRestore();
      }
    });
  });

  describe("writePreferredModel", () => {
    it("persists known persistable models", () => {
      writePreferredModel("gpt-image-2-low-1k");
      expect(window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(
        "gpt-image-2-low-1k",
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

  describe("coordinate stock save prompt dismissed preference", () => {
    it("returns false when the prompt has not been dismissed", () => {
      expect(readCoordinateStockSavePromptDismissed()).toBe(false);
    });

    it("persists true and removes the key when reset to false", () => {
      writeCoordinateStockSavePromptDismissed(true);
      expect(
        window.localStorage.getItem(
          COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY,
        ),
      ).toBe("true");
      expect(readCoordinateStockSavePromptDismissed()).toBe(true);

      writeCoordinateStockSavePromptDismissed(false);
      expect(
        window.localStorage.getItem(
          COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY,
        ),
      ).toBeNull();
      expect(readCoordinateStockSavePromptDismissed()).toBe(false);
    });
  });

  describe("safe write under storage failures", () => {
    it("does not throw when localStorage.setItem throws (e.g. quota)", () => {
      const original = window.localStorage.setItem;
      window.localStorage.setItem = jest.fn(() => {
        throw new Error("QuotaExceededError");
      });
      try {
        expect(() => writePreferredModel("gpt-image-2-low-1k")).not.toThrow();
        expect(() => writePreferredBackgroundMode("ai_auto")).not.toThrow();
      } finally {
        window.localStorage.setItem = original;
      }
    });
  });

  describe("safe access under restricted storage / SSR", () => {
    it("falls back to defaults when localStorage.getItem throws", () => {
      const getItemSpy = jest.spyOn(Storage.prototype, "getItem");
      getItemSpy.mockImplementation(() => {
        throw new Error("SecurityError");
      });
      try {
      expect(readPreferredModel()).toBe(DEFAULT_GENERATION_MODEL);
        expect(readPreferredBackgroundMode()).toBe("keep");
      } finally {
        getItemSpy.mockRestore();
      }
    });

    it("does not touch localStorage when window is unavailable", () => {
      const originalWindow = window;
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: undefined,
      });

      try {
        expect(readPreferredModel()).toBe(DEFAULT_GENERATION_MODEL);
        expect(readPreferredBackgroundMode()).toBe("keep");
        expect(() => writePreferredModel("gpt-image-2-low-1k")).not.toThrow();
        expect(() => writePreferredBackgroundMode("ai_auto")).not.toThrow();
      } finally {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    });
  });

  describe("aspect mode (Free Style)", () => {
    it("returns source by default", () => {
      expect(readPreferredAspectMode()).toBe("source");
    });

    it("round-trips a valid explicit ratio", () => {
      writePreferredAspectMode("3:4");
      expect(window.localStorage.getItem(FREE_ASPECT_MODE_STORAGE_KEY)).toBe(
        "3:4",
      );
      expect(readPreferredAspectMode()).toBe("3:4");
    });

    it("falls back to source for disallowed/invalid stored values", () => {
      // "square" は preset_categories 由来の旧互換値。Free の allowlist 外なので
      // 1:1 へ丸めず source に倒す(API が 400 にするのと境界の意味を揃える)。
      for (const bad of ["preset_image", "square", "garbage", ""]) {
        window.localStorage.setItem(FREE_ASPECT_MODE_STORAGE_KEY, bad);
        expect(readPreferredAspectMode()).toBe("source");
      }
    });

    it("normalizes on write so disallowed values never persist", () => {
      // @ts-expect-error 意図的に許容外の値を渡して正規化を検証する
      writePreferredAspectMode("preset_image");
      expect(window.localStorage.getItem(FREE_ASPECT_MODE_STORAGE_KEY)).toBe(
        "source",
      );
    });
  });
});
