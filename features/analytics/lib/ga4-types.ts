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

export interface Ga4TopTransitionRow {
  fromPage: string;
  toPage: string;
  transitionCount: number;
  sharePct: number;
}

export interface Ga4DropoffPageRow {
  page: string;
  reachedSessions: number;
  continuedSessions: number;
  dropoffSessions: number;
  dropoffRate: number;
}

export interface Ga4DashboardData {
  range: DashboardRange;
  status: Ga4DashboardStatus;
  statusMessage: string | null;
  topPages: Ga4TopPageRow[];
  topLandingPages: Ga4TopLandingPageRow[];
  topTransitions: Ga4TopTransitionRow[];
  topDropoffPages: Ga4DropoffPageRow[];
  pageFlowStatus: Ga4DashboardStatus;
  pageFlowStatusMessage: string | null;
}
