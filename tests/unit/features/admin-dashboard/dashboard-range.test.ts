import {
  getOneTapStyleRangeBounds,
  parseOneTapStyleDashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";

describe("dashboard-range", () => {
  test("ワンタップスタイル用の custom range を解釈できる", () => {
    expect(parseOneTapStyleDashboardRange("custom")).toBe("custom");
    expect(parseOneTapStyleDashboardRange("7d")).toBe("7d");
    expect(parseOneTapStyleDashboardRange("invalid")).toBe("30d");
  });

  test("custom 以外の range は通常の範囲指定として扱う", () => {
    const now = new Date("2026-04-20T00:00:00.000Z");
    const bounds = getOneTapStyleRangeBounds({
      range: "24h",
      now,
    });

    expect(bounds.range).toBe("24h");
    expect(bounds.isCustom).toBe(false);
    expect(bounds.fromIso).toBeNull();
    expect(bounds.toIso).toBeNull();
    expect(bounds.currentStartIso).toBe("2026-04-19T00:00:00.000Z");
    expect(bounds.previousStartIso).toBe("2026-04-18T00:00:00.000Z");
    expect(bounds.nowIso).toBe("2026-04-20T00:00:00.000Z");
  });

  test("custom の開始・終了日時から現在期間と前期間を作る", () => {
    const bounds = getOneTapStyleRangeBounds({
      range: "custom",
      from: "2026-04-12T03:00:00.000Z",
      to: "2026-04-15T03:00:00.000Z",
    });

    expect(bounds.range).toBe("custom");
    expect(bounds.isCustom).toBe(true);
    expect(bounds.currentStartIso).toBe("2026-04-12T03:00:00.000Z");
    expect(bounds.nowIso).toBe("2026-04-15T03:00:00.000Z");
    expect(bounds.previousStartIso).toBe("2026-04-09T03:00:00.000Z");
  });

  test("不正な custom 範囲は 30d にフォールバックする", () => {
    const now = new Date("2026-04-20T00:00:00.000Z");
    const bounds = getOneTapStyleRangeBounds({
      range: "custom",
      from: "2026-04-15T00:00:00.000Z",
      to: "2026-04-14T00:00:00.000Z",
      now,
    });

    expect(bounds.range).toBe("30d");
    expect(bounds.isCustom).toBe(false);
    expect(bounds.currentStartIso).toBe("2026-03-21T00:00:00.000Z");
    expect(bounds.nowIso).toBe("2026-04-20T00:00:00.000Z");
  });

  test("開始日時か終了日時が欠けている custom 範囲は 30d にフォールバックする", () => {
    const now = new Date("2026-04-20T00:00:00.000Z");
    const missingFromBounds = getOneTapStyleRangeBounds({
      range: "custom",
      to: "2026-04-14T00:00:00.000Z",
      now,
    });
    const invalidToBounds = getOneTapStyleRangeBounds({
      range: "custom",
      from: "2026-04-12T00:00:00.000Z",
      to: "not-a-date",
      now,
    });

    expect(missingFromBounds.range).toBe("30d");
    expect(missingFromBounds.isCustom).toBe(false);
    expect(missingFromBounds.fromIso).toBeNull();
    expect(missingFromBounds.toIso).toBeNull();
    expect(invalidToBounds.range).toBe("30d");
    expect(invalidToBounds.isCustom).toBe(false);
    expect(invalidToBounds.fromIso).toBeNull();
    expect(invalidToBounds.toIso).toBeNull();
  });
});
