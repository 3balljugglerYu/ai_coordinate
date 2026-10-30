/**
 * 「広告の成果」の数字の書き方。
 *
 * ここで守ること:
 *  - 割合は、0 を「0%」、1%未満を小数3桁、それ以外を小数2桁で出す。値が無ければ「—」
 *  - 横棒に添える割合は整数で、0より大きく1%に届かないときは「1%未満」（0% と見分ける）
 */

import {
  formatPercent,
  formatShare,
} from "@/features/admin-dashboard/lib/ad-stats/format-ad-stats";

describe("formatPercent", () => {
  it.each([
    [null, "—"],
    [0, "0%"],
    [0.00013, "0.013%"],
    [0.0297, "2.97%"],
  ])("%p は %s", (value, expected) => {
    expect(formatPercent(value)).toBe(expected);
  });
});

describe("formatShare", () => {
  it.each([
    [0, "0%"],
    [0.004, "1%未満"],
    [0.005, "1%"],
    [0.52, "52%"],
  ])("%p は %s", (value, expected) => {
    expect(formatShare(value)).toBe(expected);
  });
});
