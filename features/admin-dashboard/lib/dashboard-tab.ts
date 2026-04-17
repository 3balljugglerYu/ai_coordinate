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
  styleRange?: string;
  styleFrom?: string | null;
  styleTo?: string | null;
}): string {
  const searchParams = new URLSearchParams();
  searchParams.set("range", params.range);
  searchParams.set("tab", params.tab);

  if (params.styleRange) {
    searchParams.set("styleRange", params.styleRange);
  }

  if (params.styleFrom) {
    searchParams.set("styleFrom", params.styleFrom);
  }

  if (params.styleTo) {
    searchParams.set("styleTo", params.styleTo);
  }

  return `/admin?${searchParams.toString()}`;
}
