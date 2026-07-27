import { resolveStickyBackUrl } from "@/features/posts/lib/sticky-back-url";

const HOME = "/ja";

describe("resolveStickyBackUrl", () => {
  it("maps each from-param to its generation mode page", () => {
    expect(
      resolveStickyBackUrl({
        fromParam: "coordinate",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/coordinate");
    expect(
      resolveStickyBackUrl({
        fromParam: "style",
        isMyPageSubPath: false,
        localizedHomePath: HOME,
      }),
    ).toBe("/style");
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
