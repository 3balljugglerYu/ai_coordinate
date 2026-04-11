import type { DashboardRange } from "./dashboard-range";

export type AdminDashboardTab = "all" | "one-tap-style";

export const ADMIN_DASHBOARD_TAB_OPTIONS: Array<{
  value: AdminDashboardTab;
  label: string;
}> = [
  { value: "all", label: "すべて" },
  { value: "one-tap-style", label: "ワンタップスタイル" },
];

export function parseAdminDashboardTab(value?: string): AdminDashboardTab {
  return value === "one-tap-style" ? "one-tap-style" : "all";
}

export function buildAdminDashboardHref(params: {
  range: DashboardRange;
  tab: AdminDashboardTab;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set("range", params.range);
  searchParams.set("tab", params.tab);

  return `/admin?${searchParams.toString()}`;
}
