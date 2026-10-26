/**
 * 広告の Pixel を読み込む場所と、X に送る URL の決まり。
 */

import {
  isAdPixelExcludedPath,
  isAdPixelHost,
  isAdPixelShareablePath,
  isMetaPixelExcludedPath,
  isMetaPixelExcludedReferrer,
  toXPageLocationParams,
} from "@/features/analytics/lib/ad-pixels";

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

describe("isAdPixelExcludedPath(読み込まないのは管理画面だけ)", () => {
  test.each(["/admin", "/admin/analytics-exclusions", "/ja/admin", "/zh-CN/admin/timeline-events", "/ja/admin/", "//admin", "/ja//admin"])("%s は読み込まない", (path) => {
    expect(isAdPixelExcludedPath(path)).toBe(true);
  });

  test.each(["/", "/ja", "/ja/signup", "/login", "/ja/search", "/administrator-guide", "/zz/admin"])("%s は読み込む", (path) => {
    expect(isAdPixelExcludedPath(path)).toBe(false);
  });
});

describe("isAdPixelShareablePath(ページの場所を送ってよいページ)", () => {
  test.each([
    "/",
    "/ja",
    "/ja/",
    "/style",
    "/ja/style/",
    "/ja/campaigns/halloween-best-shot",
    "/ja/campaigns/halloween-best-shot/terms",
    "/en/catalog",
    "/ja/catalog/halloween",
    "/ja/styles/some-preset",
    "/ja/collections/italy",
    "/ja/guide/gacha",
    "/ja/tools/image-split",
    "/zh-CN/pricing",
  ])(
    "%s は送ってよい",
    (path) => {
      expect(isAdPixelShareablePath(path)).toBe(true);
    },
  );

  test.each([
    "/ja/m/secret-token",
    "/ja/posts/123",
    "/ja/posts/new/abc",
    "/ja/generate/post/abc",
    "/ja/users/abc",
    "/ja/notifications/messages",
    "/ja/search",
    "/ja/login",
    "/ja/signup",
    "/reset-password/confirm",
    "/auth/callback",
    "/ja/my-page",
    "/ja/styles-secret",
    "/ja/brand-new-page",
    "/ja/catalog/halloween/p/entry-123",
    "/ja/campaigns/halloween-best-shot/new-sub-page",
    "/ja/styles/some-preset/edit",
    "/ja/style/abc",
  ])("%s は送らない", (path) => {
    expect(isAdPixelShareablePath(path)).toBe(false);
  });
});

describe("toXPageLocationParams", () => {
  test("送ってよいページは、ドメインとページの場所だけ", () => {
    expect(toXPageLocationParams("https://www.persta.ai", "/ja/campaigns/halloween-best-shot")).toEqual({
      page_location: "https://www.persta.ai/ja/campaigns/halloween-best-shot",
    });
  });

  test("ほかのページは、URL を送らない", () => {
    expect(toXPageLocationParams("https://www.persta.ai", "/ja/posts/123")).toEqual({ hide_page_location: true });
  });
});

describe("isMetaPixelExcludedPath(Meta は URL をそのまま送るので、送らないページを決める)", () => {
  test.each([
    "/ja/admin",
    "/admin/users/u1",
    "/auth/x-complete",
    "/login",
    "/ja/signup",
    "/reset-password/confirm",
    "/account/reactivate",
    "/ja/search",
    "/search",
    "/my-page/credits",
    "/notifications/messages/1",
    "/ja/posts/new/img1",
    "/m/token123",
    "/m/token123/book",
    "//ja//search",
  ])("%s では動かさない", (path) => {
    expect(isMetaPixelExcludedPath(path)).toBe(true);
  });

  test.each(["/", "/ja", "/ja/style", "/campaigns/halloween-best-shot", "/ja/posts/123", "/users/u1", "/ja/searching", "/mypage", "/catalog"])(
    "%s では動かす",
    (path) => {
      expect(isMetaPixelExcludedPath(path)).toBe(false);
    },
  );
});

describe("isMetaPixelExcludedReferrer", () => {
  const O = "https://www.persta.ai";
  test.each([
    [`${O}/ja/search?q=secret`, true],
    [`${O}/m/token123`, true],
    [`${O}//ja//my-page`, true],
    [`${O}/ja/style`, false],
    ["https://l.facebook.com/search", false],
    ["", false],
    ["not a url", false],
  ])("%s → %s", (referrer, expected) => {
    expect(isMetaPixelExcludedReferrer(referrer, O)).toBe(expected);
  });
});
