import { formatDatetimeLocalJst } from "@/lib/datetime/format-datetime-local-jst";

describe("formatDatetimeLocalJst", () => {
  test("null / undefined / 空文字は空文字を返す", () => {
    expect(formatDatetimeLocalJst(null)).toBe("");
    expect(formatDatetimeLocalJst(undefined)).toBe("");
    expect(formatDatetimeLocalJst("")).toBe("");
  });

  test("不正な日時文字列は空文字", () => {
    expect(formatDatetimeLocalJst("not-a-date")).toBe("");
  });

  test("UTC ISO を +9h して datetime-local JST 形式へ変換", () => {
    // 2026-06-10 05:30 UTC = 2026-06-10 14:30 JST
    expect(formatDatetimeLocalJst("2026-06-10T05:30:00Z")).toBe(
      "2026-06-10T14:30",
    );
  });

  test("日付/時刻のゼロ詰めが効く", () => {
    // 2026-01-02 03:04 UTC = 2026-01-02 12:04 JST
    expect(formatDatetimeLocalJst("2026-01-02T03:04:00Z")).toBe(
      "2026-01-02T12:04",
    );
  });

  test("JST 表示が日付境界をまたぐケース (UTC 16:00 → JST 翌日 01:00)", () => {
    // 2026-06-10 16:00 UTC = 2026-06-11 01:00 JST
    expect(formatDatetimeLocalJst("2026-06-10T16:00:00Z")).toBe(
      "2026-06-11T01:00",
    );
  });

  test("非 UTC オフセット付き ISO もタイムゾーン非依存に処理 (内部で +09:00)", () => {
    // +05:00 表現の 09:30 = UTC 04:30 = JST 13:30
    expect(formatDatetimeLocalJst("2026-06-10T09:30:00+05:00")).toBe(
      "2026-06-10T13:30",
    );
  });
});
