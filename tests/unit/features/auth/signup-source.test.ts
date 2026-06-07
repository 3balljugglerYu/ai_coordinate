import {
  STYLE_SIGNUP_SOURCE,
  WARDROBE_SIGNUP_SOURCE,
  parseSignupSource,
} from "@/features/auth/lib/signup-source";

describe("parseSignupSource", () => {
  test("既知の値(style / wardrobe)はそのまま返す", () => {
    expect(parseSignupSource("style")).toBe(STYLE_SIGNUP_SOURCE);
    expect(parseSignupSource("wardrobe")).toBe(WARDROBE_SIGNUP_SOURCE);
  });

  test("未知の値 / null / undefined / 空文字は null", () => {
    expect(parseSignupSource("coordinate")).toBeNull();
    expect(parseSignupSource("")).toBeNull();
    expect(parseSignupSource(null)).toBeNull();
    expect(parseSignupSource(undefined)).toBeNull();
  });
});
