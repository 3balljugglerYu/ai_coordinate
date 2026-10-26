/**
 * ログインのあとなどに移る先を、このサイトの中のパスだけにする(オープンリダイレクトを防ぐ)。
 */

import { pickSafeRedirectPath, toSafeRedirectPath } from "@/lib/security/safe-redirect-path";

describe("toSafeRedirectPath", () => {
  test.each([
    ["/", "/"],
    ["/ja/style", "/ja/style"],
    ["/ja/style?tab=free#top", "/ja/style?tab=free#top"],
    ["/my-page?claim_wardrobe=1", "/my-page?claim_wardrobe=1"],
    ["  /ja/posts/1  ", "/ja/posts/1"],
  ])("このサイトの中のパス %s はそのまま", (input, expected) => {
    expect(toSafeRedirectPath(input)).toBe(expected);
  });

  test.each([
    "@evil.com",
    "https://evil.com",
    "http://evil.com/ja",
    "//evil.com",
    "//evil.com/ja/style",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
    "/..//evil.com",
    "/.//evil.com",
    "/a/..//evil.com",
    "/%2e%2e//evil.com",
    "/./\\evil.com",
    "/a/../\\evil.com",
    "evil.com",
    "",
  ])("よそへ移る値 %j は既定の / にする", (input) => {
    expect(toSafeRedirectPath(input)).toBe("/");
  });

  test("返す値は、どんな値を入れても // で始まらない(読み直したあとで確かめる)", () => {
    const inputs = ["/..//x.com", "/./\\x.com", "/%2e//x.com", "/a/b/../../..//x.com", "/;/..//x.com", "/.%2e//x.com"];
    for (const input of inputs) {
      const out = toSafeRedirectPath(input);
      expect(out.startsWith("//")).toBe(false);
      expect(out.startsWith("/\\")).toBe(false);
    }
  });

  test("..を含んでも、このサイトの中に収まるならそのまま縮めた値を返す", () => {
    expect(toSafeRedirectPath("/ja/style/../posts/1")).toBe("/ja/posts/1");
  });

  test("値が無いときは既定の値にする(既定は変えられる)", () => {
    expect(toSafeRedirectPath(null)).toBe("/");
    expect(toSafeRedirectPath(undefined, "/login")).toBe("/login");
    expect(toSafeRedirectPath("//evil.com", "/login")).toBe("/login");
  });
});

describe("pickSafeRedirectPath", () => {
  test("空・おかしな値を飛ばして、決まりに合う最初の候補を使う", () => {
    expect(pickSafeRedirectPath(["", "/ja/style"])).toBe("/ja/style");
    expect(pickSafeRedirectPath(["//evil.com", null, "/ja/posts/1"])).toBe("/ja/posts/1");
    expect(pickSafeRedirectPath([undefined, "@evil.com", "/..//evil.com", "/ja"])).toBe("/ja");
  });

  test("1つ目が正しければ、それを使う", () => {
    expect(pickSafeRedirectPath(["/my-page", "/ja/style"])).toBe("/my-page");
  });

  test("どれも合わなければ既定の値", () => {
    expect(pickSafeRedirectPath(["https://evil.com", "", null])).toBe("/");
    expect(pickSafeRedirectPath([], "/login")).toBe("/login");
  });
});

