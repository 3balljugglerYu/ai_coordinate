/**
 * 広告の Pixel を読み込む場所の決まり。
 * 本番のサイトだけ・管理画面とログインの途中では読み込まない。
 */

import { isAdPixelExcludedPath, isAdPixelHost } from "@/features/analytics/lib/ad-pixels";

describe("isAdPixelHost", () => {
  test.each(["www.persta.ai", "persta.ai", "WWW.Persta.AI"])("%s は本番", (host) => {
    expect(isAdPixelHost(host)).toBe(true);
  });

  test.each(["localhost", "127.0.0.1", "ai-coordinate-git-feat-x.vercel.app", "persta.ai.example.com", "staging.persta.ai"])(
    "%s では読み込まない",
    (host) => {
      expect(isAdPixelHost(host)).toBe(false);
    },
  );
});

describe("isAdPixelExcludedPath", () => {
  test.each([
    "/admin",
    "/admin/analytics-exclusions",
    "/ja/admin",
    "/zh-CN/admin/timeline-events",
    "/auth/callback",
    "/en/auth/x-complete",
    "/login",
    "/ja/signup",
    "/reset-password/confirm",
    "/account/reactivate",
    "/ja/search",
    "/ja/admin/",
  ])(
    "%s は外す",
    (path) => {
      expect(isAdPixelExcludedPath(path)).toBe(true);
    },
  );

  test.each(["/", "/ja", "/style", "/ja/style", "/administrator-guide", "/ja/authors", "/zz/admin", "/searching", "/ja/users/abc"])(
    "%s は外さない",
    (path) => {
      expect(isAdPixelExcludedPath(path)).toBe(false);
    },
  );
});
