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
});
