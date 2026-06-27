import {
  STYLE_SIGNUP_SOURCE,
  WARDROBE_SIGNUP_SOURCE,
  parseSignupSource,
} from "@/features/auth/lib/signup-source";

describe("parseSignupSource", () => {
  test("代表値(style / wardrobe)はそのまま返す", () => {
    expect(parseSignupSource("style")).toBe(STYLE_SIGNUP_SOURCE);
    expect(parseSignupSource("wardrobe")).toBe(WARDROBE_SIGNUP_SOURCE);
  });

  test("外部チャネル等の自由形式タグも受理する(書式を満たす場合)", () => {
    expect(parseSignupSource("x_profile")).toBe("x_profile");
    expect(parseSignupSource("x_post_20260627")).toBe("x_post_20260627");
    expect(parseSignupSource("instagram")).toBe("instagram");
  });

  test("トリム・小文字化してサニタイズする", () => {
    expect(parseSignupSource("  X_Profile  ")).toBe("x_profile");
    expect(parseSignupSource("INSTAGRAM")).toBe("instagram");
  });

  test("null / undefined / 空文字は null", () => {
    expect(parseSignupSource("")).toBeNull();
    expect(parseSignupSource(null)).toBeNull();
    expect(parseSignupSource(undefined)).toBeNull();
  });

  test("書式違反(許可外文字 / 40字超)は null", () => {
    expect(parseSignupSource("has space")).toBeNull();
    expect(parseSignupSource("bad!char")).toBeNull();
    expect(parseSignupSource("日本語タグ")).toBeNull();
    expect(parseSignupSource("a".repeat(41))).toBeNull();
  });
});
