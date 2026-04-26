import { buildCurrentUrl } from "@/lib/build-current-url";

describe("buildCurrentUrl", () => {
  test("pathname のみのときは search を付けない", () => {
    expect(buildCurrentUrl("/style", new URLSearchParams())).toBe("/style");
    expect(buildCurrentUrl("/coordinate", null)).toBe("/coordinate");
  });

  test("search がある場合は ?key=value 形式で結合する", () => {
    expect(
      buildCurrentUrl("/style", new URLSearchParams({ style: "foo" }))
    ).toBe("/style?style=foo");
  });

  test("複数の search パラメータも保持する", () => {
    const params = new URLSearchParams();
    params.set("style", "foo");
    params.set("ref", "home");
    expect(buildCurrentUrl("/style", params)).toBe("/style?style=foo&ref=home");
  });

  test("pathname が null のときは / にフォールバック", () => {
    expect(buildCurrentUrl(null, new URLSearchParams({ x: "y" }))).toBe("/");
  });
});
