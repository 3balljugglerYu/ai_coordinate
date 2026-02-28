import type { DashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";

export type Ga4DashboardStatus = "ready" | "disabled" | "error";

export interface Ga4TopPageRow {
  path: string;
  title: string | null;
  views: number;
  activeUsers: number;
}

export interface Ga4TopLandingPageRow {
  landingPage: string;
  sessions: number;
  activeUsers: number;
}

export interface Ga4DashboardData {
  range: DashboardRange;
  status: Ga4DashboardStatus;
  statusMessage: string | null;
  topPages: Ga4TopPageRow[];
  topLandingPages: Ga4TopLandingPageRow[];
  transitionsPendingMessage: string | null;
}
