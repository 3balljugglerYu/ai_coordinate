import { resolveStickyBackUrl } from "@/features/posts/lib/sticky-back-url";

const HOME = "/ja";

describe("resolveStickyBackUrl", () => {
  it("returns /style for from=style", () => {
    expect(
      resolveStickyBackUrl({
        fromParam: "style",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/style");
  });

  it("returns /free for from=coordinate (Coordinate は廃止して Free Style へ転送している)", () => {
    // 旧 URL に残るほか、Inspire の結果一覧も from=coordinate を付けている
    expect(
      resolveStickyBackUrl({
        fromParam: "coordinate",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/free");
  });

  it("returns /free for from=free (じゆうモードの戻り先がホームに落ちない)", () => {
    expect(
      resolveStickyBackUrl({
        fromParam: "free",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/free");
  });

  it("handles my-page and notifications", () => {
    expect(
      resolveStickyBackUrl({
        fromParam: "my-page",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/my-page");
    expect(
      resolveStickyBackUrl({
        fromParam: "notifications",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/notifications");
  });

  it("falls back to /my-page for my-page subpaths when from is absent", () => {
    expect(
      resolveStickyBackUrl({
        fromParam: null,
        isMyPageSubPath: true,
        localizedHomePath: HOME,
      }),
    ).toBe("/my-page");
  });

  it("falls back to the localized home path otherwise", () => {
    expect(
      resolveStickyBackUrl({
        fromParam: null,
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe(HOME);
    expect(
      resolveStickyBackUrl({
        fromParam: "unknown",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe(HOME);
  });
});
