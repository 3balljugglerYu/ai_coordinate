import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";
import type {
  DashboardFunnelStep,
  DashboardModelMixItem,
  DashboardTrendPoint,
} from "../lib/dashboard-types";
import { AdminPageAnalyticsSection } from "./AdminPageAnalyticsSection";

interface AdminPageAnalyticsSectionServerProps {
  ga4Promise: Promise<Ga4DashboardData>;
  trend: DashboardTrendPoint[];
  funnel: DashboardFunnelStep[];
  modelMix: DashboardModelMixItem[];
}

export async function AdminPageAnalyticsSectionServer({
  ga4Promise,
  trend,
  funnel,
  modelMix,
}: AdminPageAnalyticsSectionServerProps) {
  const ga4 = await ga4Promise;

  return (
    <AdminPageAnalyticsSection
      ga4={ga4}
      trend={trend}
      funnel={funnel}
      modelMix={modelMix}
    />
  );
}
