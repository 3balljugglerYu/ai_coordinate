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
});
