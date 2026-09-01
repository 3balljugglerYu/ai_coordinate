/**
 * 利用回数の表示丸め（`usageCountBucket`）のテスト。
 *
 * 文言が「{count}回以上利用されました」で固定なので、ここが**切り上げ**に
 * 転ぶと画面の表示がそのまま嘘になる（8 回を「10回以上」と言ってしまう）。
 * 境界を全部そのまま検査する。
 */

import {
  USAGE_COUNT_DISPLAY_MIN,
  usageCountBucket,
} from "@/features/posts/lib/constants";

describe("usageCountBucket", () => {
  test("下限未満は出さない", () => {
    expect(usageCountBucket(0)).toBeNull();
    expect(usageCountBucket(1)).toBeNull();
    expect(usageCountBucket(USAGE_COUNT_DISPLAY_MIN - 1)).toBeNull();
  });

  test("3〜4 は下限そのものを出す", () => {
    expect(usageCountBucket(3)).toBe(3);
    expect(usageCountBucket(4)).toBe(3);
  });

  test("5〜49 は 5 刻み", () => {
    expect(usageCountBucket(5)).toBe(5);
    expect(usageCountBucket(9)).toBe(5);
    expect(usageCountBucket(10)).toBe(10);
    expect(usageCountBucket(14)).toBe(10);
    expect(usageCountBucket(45)).toBe(45);
    expect(usageCountBucket(49)).toBe(45);
  });

  test("50 以上は 10 刻み", () => {
    expect(usageCountBucket(50)).toBe(50);
    expect(usageCountBucket(59)).toBe(50);
    expect(usageCountBucket(60)).toBe(60);
    expect(usageCountBucket(125)).toBe(120);
  });

  test("必ず実際の回数以下に丸める（「以上」の文言を嘘にしない）", () => {
    for (let count = 0; count <= 300; count += 1) {
      const bucket = usageCountBucket(count);
      if (bucket !== null) {
        expect(bucket).toBeLessThanOrEqual(count);
      }
    }
  });

  test("回数が増えて丸めた値が下がることはない（表示が巻き戻らない）", () => {
    let previous = 0;
    for (let count = 0; count <= 300; count += 1) {
      const bucket = usageCountBucket(count) ?? 0;
      expect(bucket).toBeGreaterThanOrEqual(previous);
      previous = bucket;
    }
  });

  test("数値でない入力は出さない（NaN をそのまま描画しない）", () => {
    expect(usageCountBucket(Number.NaN)).toBeNull();
    expect(usageCountBucket(Number.POSITIVE_INFINITY)).toBeNull();
    expect(usageCountBucket(-1)).toBeNull();
  });
});
