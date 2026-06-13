import type { DashboardRange } from "./dashboard-range";

export type AdminDashboardTab = "all" | "one-tap-style" | "collections";

export const ADMIN_DASHBOARD_TAB_OPTIONS: Array<{
  value: AdminDashboardTab;
  label: string;
}> = [
  { value: "all", label: "すべて" },
  { value: "one-tap-style", label: "ワンタップスタイル" },
  { value: "collections", label: "コレクション" },
];

export function parseAdminDashboardTab(value?: string): AdminDashboardTab {
  if (value === "one-tap-style") return "one-tap-style";
  if (value === "collections") return "collections";
  return "all";
}

export function buildAdminDashboardHref(params: {
  range: DashboardRange;
  tab: AdminDashboardTab;
  styleRange?: string;
  styleFrom?: string | null;
  styleTo?: string | null;
  collectionRange?: string;
  collectionFrom?: string | null;
  collectionTo?: string | null;
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

  if (params.collectionRange) {
    searchParams.set("collectionRange", params.collectionRange);
  }

  if (params.collectionFrom) {
    searchParams.set("collectionFrom", params.collectionFrom);
  }

  if (params.collectionTo) {
    searchParams.set("collectionTo", params.collectionTo);
  }

  return `/admin?${searchParams.toString()}`;
}
