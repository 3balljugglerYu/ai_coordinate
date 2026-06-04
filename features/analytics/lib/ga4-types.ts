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

export interface Ga4EntryAccessRow {
  dateKey: string;
  landingPage: string;
  sessions: number;
}

export interface Ga4ExternalAccessRow {
  dateKey: string;
  xSessions: number;
  campfireSessions: number;
  searchSessions: number;
  otherExternalSessions: number;
  totalExternalSessions: number;
}

export interface Ga4DauRow {
  dateKey: string;
  /** その日に logged_in='yes' イベントを持つ distinct 訪問者 */
  loggedIn: number;
  /** logged_in='no' のみ(ゲスト)の distinct 訪問者 */
  guest: number;
  /** logged_in 未取得(計測前/初回pageview取りこぼし)の distinct 訪問者 */
  unknown: number;
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
  entryAccessStatus: Ga4DashboardStatus;
  entryAccessStatusMessage: string | null;
  entryAccessRows: Ga4EntryAccessRow[];
  entryAccessDateKeys: string[];
  externalAccessStatus: Ga4DashboardStatus;
  externalAccessStatusMessage: string | null;
  externalAccessRows: Ga4ExternalAccessRow[];
  dauMauStatus: Ga4DashboardStatus;
  dauMauStatusMessage: string | null;
  dauRows: Ga4DauRow[];
  mau: number;
  topTransitions: Ga4TopTransitionRow[];
  topDropoffPages: Ga4DropoffPageRow[];
  pageFlowStatus: Ga4DashboardStatus;
  pageFlowStatusMessage: string | null;
}
