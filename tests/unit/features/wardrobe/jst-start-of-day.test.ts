/** @jest-environment node */

import { jstStartOfDayIso } from "@/app/api/wardrobe/claim/save-wardrobe-image";

// JST = UTC+9。JST の日の境界は UTC 15:00。
describe("jstStartOfDayIso", () => {
  test("JST 0:30 (= 前日 15:30 UTC) → その JST 日の 0:00 (= 前日 15:00 UTC)", () => {
    expect(jstStartOfDayIso(Date.parse("2026-06-06T15:30:00Z"))).toBe(
      "2026-06-06T15:00:00.000Z",
    );
  });

  test("JST 23:59 (= 同日 14:59 UTC) → 同じ JST 日の 0:00 (= 前日 15:00 UTC)", () => {
    expect(jstStartOfDayIso(Date.parse("2026-06-06T14:59:00Z"))).toBe(
      "2026-06-05T15:00:00.000Z",
    );
  });

  test("ちょうど JST 0:00 (= 15:00 UTC) は同時刻を返す (境界)", () => {
    expect(jstStartOfDayIso(Date.parse("2026-06-06T15:00:00Z"))).toBe(
      "2026-06-06T15:00:00.000Z",
    );
  });

  test("月またぎ: JST 6/1 0:10 (= 5/31 15:10 UTC) → 5/31 15:00 UTC", () => {
    expect(jstStartOfDayIso(Date.parse("2026-05-31T15:10:00Z"))).toBe(
      "2026-05-31T15:00:00.000Z",
    );
  });
});
