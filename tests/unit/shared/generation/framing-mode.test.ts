/** @jest-environment node */

import {
  DEFAULT_FRAMING_MODE,
  FRAMING_MODES,
  isUnlockedFramingMode,
  parseFramingMode,
} from "@/shared/generation/framing-mode";

describe("shared/generation/framing-mode", () => {
  test("FRAMING_MODES は locked / free_pose / ai_pose の 3 値", () => {
    expect(FRAMING_MODES).toEqual(["locked", "free_pose", "ai_pose"]);
  });

  test("デフォルトは locked (現行挙動)", () => {
    expect(DEFAULT_FRAMING_MODE).toBe("locked");
  });

  describe("isUnlockedFramingMode", () => {
    test("free_pose / ai_pose は true、locked / undefined は false", () => {
      expect(isUnlockedFramingMode("free_pose")).toBe(true);
      expect(isUnlockedFramingMode("ai_pose")).toBe(true);
      expect(isUnlockedFramingMode("locked")).toBe(false);
      expect(isUnlockedFramingMode(undefined)).toBe(false);
    });
  });

  describe("parseFramingMode", () => {
    test("既知の値はそのまま返す", () => {
      expect(parseFramingMode("locked")).toBe("locked");
      expect(parseFramingMode("free_pose")).toBe("free_pose");
      expect(parseFramingMode("ai_pose")).toBe("ai_pose");
    });

    test("未知の文字列は null", () => {
      expect(parseFramingMode("free")).toBeNull();
      expect(parseFramingMode("FREE_POSE")).toBeNull();
      expect(parseFramingMode("")).toBeNull();
    });

    test("非文字列は null", () => {
      expect(parseFramingMode(null)).toBeNull();
      expect(parseFramingMode(undefined)).toBeNull();
      expect(parseFramingMode(true)).toBeNull();
      expect(parseFramingMode(1)).toBeNull();
      expect(parseFramingMode({})).toBeNull();
    });
  });
});
