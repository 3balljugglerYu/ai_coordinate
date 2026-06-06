import { watermarkOutputMime } from "@/features/generation/lib/apply-watermark";

describe("watermarkOutputMime", () => {
  test("jpeg / webp は維持する (拡張子と齟齬を出さない)", () => {
    expect(watermarkOutputMime("image/jpeg")).toBe("image/jpeg");
    expect(watermarkOutputMime("image/webp")).toBe("image/webp");
  });

  test("png はそのまま png", () => {
    expect(watermarkOutputMime("image/png")).toBe("image/png");
  });

  test("その他 (gif / 空 / 不明) は png に正規化", () => {
    expect(watermarkOutputMime("image/gif")).toBe("image/png");
    expect(watermarkOutputMime("")).toBe("image/png");
    expect(watermarkOutputMime("application/octet-stream")).toBe("image/png");
  });
});
