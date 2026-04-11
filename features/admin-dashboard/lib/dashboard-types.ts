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

export type DashboardOneTapStyleMetricKey =
  | "visits"
  | "generations"
  | "downloads"
  | "rateLimited";

export interface DashboardOneTapStyleMetric {
  key: DashboardOneTapStyleMetricKey;
  label: string;
  currentCount: number;
  previousCount: number;
  deltaPct: number | null;
  deltaDirection: DashboardDeltaDirection;
}

export interface DashboardOneTapStyleSummary {
  metrics: DashboardOneTapStyleMetric[];
}

export interface DashboardOneTapStyleTrendPoint {
  bucket: string;
  label: string;
  visits: number;
  generations: number;
  downloads: number;
  rateLimited: number;
}

export interface DashboardOneTapStyleAnalytics {
  summary: DashboardOneTapStyleSummary;
  trend: DashboardOneTapStyleTrendPoint[];
}

export type DashboardOneTapStyleFocusMetricKey =
  | "attempts"
  | "successRate"
  | "downloadRate"
  | "rateLimitedShare";

export interface DashboardOneTapStyleFocusMetric {
  key: DashboardOneTapStyleFocusMetricKey;
  label: string;
  value: string;
  previousValue: string;
  deltaPct: number | null;
  deltaDirection: DashboardDeltaDirection;
  description: string;
}

export interface DashboardOneTapStyleSegmentRow {
  authState: "guest" | "authenticated";
  label: string;
  visits: number;
  attempts: number;
  generations: number;
  downloads: number;
  rateLimited: number;
  successRatePct: number | null;
  downloadRatePct: number | null;
  rateLimitedSharePct: number | null;
}

export interface DashboardOneTapStylePresetPerformanceRow {
  presetId: string;
  title: string;
  status: "draft" | "published" | "unknown";
  authenticatedAttempts: number;
  generations: number;
  downloads: number;
  rateLimited: number;
  generationSharePct: number;
  authenticatedSuccessRatePct: number | null;
  downloadRatePct: number | null;
}

export interface DashboardOneTapStyleInsight {
  id: string;
  title: string;
  description: string;
  severity: "success" | "info" | "warning";
}

export interface DashboardOneTapStyleOperationalSummary {
  publishedPresetCount: number;
  draftPresetCount: number;
  activePresetCount: number;
  zeroGenerationPublishedPresetCount: number;
  authenticatedAttemptCount: number;
  guestAttemptCount: number;
}

export interface DashboardOneTapStyleDetailedAnalytics {
  analytics: DashboardOneTapStyleAnalytics;
  focusMetrics: DashboardOneTapStyleFocusMetric[];
  segments: DashboardOneTapStyleSegmentRow[];
  presetPerformance: DashboardOneTapStylePresetPerformanceRow[];
  insights: DashboardOneTapStyleInsight[];
  operationalSummary: DashboardOneTapStyleOperationalSummary;
  dormantPublishedPresetTitles: string[];
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
  trend: DashboardTrendPoint[];
  oneTapStyle: DashboardOneTapStyleAnalytics;
  oneTapStyleDetailed: DashboardOneTapStyleDetailedAnalytics;
  revenueTrend: DashboardRevenueTrend;
  opsSummary: DashboardOpsSummary;
  funnel: DashboardFunnelStep[];
  modelMix: DashboardModelMixItem[];
  recentPurchases: DashboardPurchaseRow[];
  alerts: DashboardAlertRow[];
  quickActions: DashboardQuickAction[];
}
