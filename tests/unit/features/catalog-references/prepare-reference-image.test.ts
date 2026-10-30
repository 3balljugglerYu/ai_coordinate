/** @jest-environment node */

/**
 * 見本(参照画像)を上げる前の縮め方(planReferenceResize)。
 * POST /api/catalog-references の決まり(縦横とも 768〜4096px・4MB まで)に合わせる。
 *
 * ここで守ること:
 *  - 決まりの内なら、そのまま送る(JPEG・PNG・WebP)
 *  - 縮めるときは長い辺を 2048px のめやすにするが、短い辺は 768px を下回らせない
 *    (元の画像の縮め方は長い辺を 1024px まで縮めるので、縦長・横長が必ず断られていた)
 *  - 短い辺が元から 768px 未満なら、上げる前に断る。細長すぎて決まりを守れないときも断る
 */

import { planReferenceResize, REFERENCE_UPLOAD_MAX_BYTES } from "@/features/catalog-references/lib/prepare-reference-image";

const MB = 1024 * 1024;

test("決まりの内なら、そのまま送る", () => {
  expect(planReferenceResize({ width: 1200, height: 1600, bytes: 1 * MB, type: "image/png" })).toEqual({ kind: "as_is" });
});

test.each([
  ["3MB を超える縦長(2:3)", { width: 2000, height: 3000, bytes: 4 * MB }, { width: 1365, height: 2048 }],
  ["大きい横長(3:2)の写真", { width: 6000, height: 4000, bytes: 8 * MB }, { width: 2048, height: 1365 }],
  ["縦長のスクリーンショット(9:16)", { width: 1080, height: 1920, bytes: 5 * MB }, { width: 1080, height: 1920 }],
  ["細長い(1:3)。短い辺を 768px に合わせる", { width: 1200, height: 3600, bytes: 6 * MB }, { width: 768, height: 2304 }],
])("%s は、短い辺を 768px 以上に保って縮める", (_label, input, expected) => {
  const plan = planReferenceResize({ ...input, type: "image/jpeg" });
  expect(plan).toEqual({ kind: "resize", ...expected });
  if (plan.kind === "resize") {
    expect(Math.min(plan.width, plan.height)).toBeGreaterThanOrEqual(768);
    expect(Math.max(plan.width, plan.height)).toBeLessThanOrEqual(4096);
  }
});

test("縦横の上限(4096px)を超えるなら、小さくても縮める", () => {
  expect(planReferenceResize({ width: 5000, height: 3000, bytes: 2 * MB, type: "image/jpeg" })).toEqual({
    kind: "resize",
    width: 2048,
    height: 1229,
  });
});

test("JPEG・PNG・WebP 以外は、決まりの内でも作り直す", () => {
  expect(planReferenceResize({ width: 1200, height: 1600, bytes: 1 * MB, type: "image/gif" }).kind).toBe("resize");
});

test("ちょうど上限の大きさなら、そのまま送る", () => {
  expect(
    planReferenceResize({ width: 768, height: 4096, bytes: REFERENCE_UPLOAD_MAX_BYTES, type: "image/webp" }),
  ).toEqual({ kind: "as_is" });
});

test.each([
  ["短い辺が 768px 未満", { width: 700, height: 2000, bytes: 1 * MB }, "too_small"],
  ["細長すぎて、上限と下限を両方は守れない(1:6)", { width: 800, height: 4800, bytes: 6 * MB }, "too_large"],
])("%s は断る", (_label, input, problem) => {
  expect(planReferenceResize({ ...input, type: "image/jpeg" })).toEqual({ kind: "reject", problem });
});
