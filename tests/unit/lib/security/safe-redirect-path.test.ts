/**
 * ログインのあとなどに移る先を、このサイトの中のパスだけにする(オープンリダイレクトを防ぐ)。
 */

import { toSafeRedirectPath } from "@/lib/security/safe-redirect-path";

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
    "evil.com",
    "",
  ])("よそへ移る値 %j は既定の / にする", (input) => {
    expect(toSafeRedirectPath(input)).toBe("/");
  });

  test("値が無いときは既定の値にする(既定は変えられる)", () => {
    expect(toSafeRedirectPath(null)).toBe("/");
    expect(toSafeRedirectPath(undefined, "/login")).toBe("/login");
    expect(toSafeRedirectPath("//evil.com", "/login")).toBe("/login");
  });
});
