import { formatSourceImageReadError } from "@/features/generation/lib/normalize-source-image";

describe("formatSourceImageReadError", () => {
  test("サイズ(MB)と形式を半角括弧で付与する", () => {
    expect(
      formatSourceImageReadError("読み込めませんでした", {
        size: 2 * 1024 * 1024,
        type: "image/jpeg",
      }),
    ).toBe("読み込めませんでした (2.0MB / image/jpeg)");
  });

  test("小数1桁に丸める", () => {
    expect(
      formatSourceImageReadError("X", {
        size: 1.5 * 1024 * 1024,
        type: "image/png",
      }),
    ).toBe("X (1.5MB / image/png)");
  });

  test("type が空文字なら unknown を表示する", () => {
    expect(
      formatSourceImageReadError("X", { size: 0, type: "" }),
    ).toBe("X (0.0MB / unknown)");
  });
});
