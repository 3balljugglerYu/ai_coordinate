import {
  ADMIN_DASHBOARD_TAB_OPTIONS,
  buildAdminDashboardHref,
  parseAdminDashboardTab,
} from "@/features/admin-dashboard/lib/dashboard-tab";

describe("dashboard-tab", () => {
  test("collections / one-tap-style / 既定 all を解釈できる", () => {
    expect(parseAdminDashboardTab("collections")).toBe("collections");
    expect(parseAdminDashboardTab("one-tap-style")).toBe("one-tap-style");
    expect(parseAdminDashboardTab(undefined)).toBe("all");
    expect(parseAdminDashboardTab("garbage")).toBe("all");
  });

  test("tab options に コレクション を含む", () => {
    expect(ADMIN_DASHBOARD_TAB_OPTIONS).toContainEqual({
      value: "collections",
      label: "コレクション",
    });
  });

  test("collections タブの href に style パラメータが混ざらない", () => {
    expect(buildAdminDashboardHref({ range: "30d", tab: "collections" })).toBe(
      "/admin?range=30d&tab=collections",
    );
  });

  test("collections の custom 期間 href に collectionRange/From/To を含む", () => {
    const href = buildAdminDashboardHref({
      range: "30d",
      tab: "collections",
      collectionRange: "custom",
      collectionFrom: "2026-06-01T00:00:00.000Z",
      collectionTo: "2026-06-10T00:00:00.000Z",
    });
    expect(href).toContain("tab=collections");
    expect(href).toContain("collectionRange=custom");
    expect(href).toContain("collectionFrom=");
    expect(href).toContain("collectionTo=");
  });
});
