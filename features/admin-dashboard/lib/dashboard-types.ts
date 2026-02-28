import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";

export type DashboardDeltaDirection = "up" | "down" | "flat";

export type DashboardKpiKey =
  | "signups"
  | "generations"
  | "liveRevenue"
  | "pendingModeration";

export interface DashboardQuickAction {
  label: string;
  href: string;
  description: string;
  iconKey: string;
}

export interface AdminDashboardKpi {
  key: DashboardKpiKey;
  label: string;
  value: string;
  deltaPct: number | null;
  deltaDirection: DashboardDeltaDirection;
  subtext: string;
}

export interface DashboardTrendPoint {
  bucket: string;
  label: string;
  signups: number;
  generations: number;
}

export interface DashboardRevenueSeries {
  key: string;
  label: string;
  color: string;
}

export interface DashboardRevenueTrendPoint {
  bucket: string;
  label: string;
  totalRevenueYen: number;
  breakdown: Record<string, number>;
}

export interface DashboardRevenueTrend {
  series: DashboardRevenueSeries[];
  points: DashboardRevenueTrendPoint[];
}

export interface DashboardModelMixItem {
  model: string;
  count: number;
  sharePct: number;
}

export interface DashboardFunnelStep {
  label: string;
  users: number;
  rateFromPrevious: number | null;
}

export interface DashboardOpsSummary {
  failedJobs: number;
  averageOrderValueYen: number | null;
  purchaseCount: number;
  purchasingUsers: number;
  expiringUsers: number;
  expiringPercoins: number;
  totalPaidBalance: number;
  totalPromoBalance: number;
}

export type DashboardAlertSeverity = "critical" | "warning" | "info";

export interface DashboardAlertRow {
  id: string;
  severity: DashboardAlertSeverity;
  label: string;
  description: string;
  href: string;
}

export interface DashboardPurchaseRow {
  id: string;
  createdAt: string;
  userId: string;
  nickname: string | null;
  mode: string;
  packageLabel: string;
  percoins: number;
  yenValue: number | null;
}

export interface AdminDashboardData {
  range: import("./dashboard-range").DashboardRange;
  updatedAt: string;
  kpis: AdminDashboardKpi[];
  ga4: Ga4DashboardData;
  trend: DashboardTrendPoint[];
  revenueTrend: DashboardRevenueTrend;
  opsSummary: DashboardOpsSummary;
  funnel: DashboardFunnelStep[];
  modelMix: DashboardModelMixItem[];
  recentPurchases: DashboardPurchaseRow[];
  alerts: DashboardAlertRow[];
  quickActions: DashboardQuickAction[];
}
