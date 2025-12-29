/**
 * formatCountEnUS関数のテスト
 * 境界値や特殊ケースを網羅的にテスト
 */

import { formatCountEnUS } from "./utils";

describe("formatCountEnUS", () => {
  // 基本ケース
  test("999未満はそのまま", () => {
    expect(formatCountEnUS(0)).toBe("0");
    expect(formatCountEnUS(1)).toBe("1");
    expect(formatCountEnUS(99)).toBe("99");
    expect(formatCountEnUS(999)).toBe("999");
  });

  // K形式の基本
  test("K形式の基本", () => {
    expect(formatCountEnUS(1000)).toBe("1K");
    expect(formatCountEnUS(1530)).toBe("1.53K");
    expect(formatCountEnUS(20700)).toBe("20.7K");
    expect(formatCountEnUS(50400)).toBe("50.4K");
    expect(formatCountEnUS(62500)).toBe("62.5K");
    expect(formatCountEnUS(133000)).toBe("133K");
    expect(formatCountEnUS(341000)).toBe("341K");
  });

  // 境界処理（重要）
  test("境界処理: 9950 → 10K", () => {
    expect(formatCountEnUS(9950)).toBe("10K");
  });

  test("境界処理: 9999 → 10K", () => {
    expect(formatCountEnUS(9999)).toBe("10K");
  });

  test("境界処理: 99950 → 100K", () => {
    expect(formatCountEnUS(99950)).toBe("100K");
  });

  test("境界処理: 999500 → 1M", () => {
    expect(formatCountEnUS(999500)).toBe("1M");
  });

  // M形式の基本
  test("M形式の基本", () => {
    expect(formatCountEnUS(1800000)).toBe("1.8M");
    expect(formatCountEnUS(2620000)).toBe("2.62M");
    expect(formatCountEnUS(5500000)).toBe("5.5M");
    expect(formatCountEnUS(19600000)).toBe("19.6M");
  });

  // B形式（将来拡張）
  test("B形式（将来拡張）", () => {
    expect(formatCountEnUS(999500000)).toBe("1B");
  });

  // 負数対応
  test("負数対応", () => {
    expect(formatCountEnUS(-1000)).toBe("-1K");
    expect(formatCountEnUS(-1530)).toBe("-1.53K");
  });

  // 特殊値
  test("特殊値", () => {
    expect(formatCountEnUS(Infinity)).toBe("0");
    expect(formatCountEnUS(-Infinity)).toBe("0");
    expect(formatCountEnUS(NaN)).toBe("0");
  });
});

