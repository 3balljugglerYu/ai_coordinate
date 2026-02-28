import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";
import { AdminPageAnalyticsSection } from "./AdminPageAnalyticsSection";

interface AdminPageAnalyticsSectionServerProps {
  ga4Promise: Promise<Ga4DashboardData>;
}

export async function AdminPageAnalyticsSectionServer({
  ga4Promise,
}: AdminPageAnalyticsSectionServerProps) {
  const ga4 = await ga4Promise;

  return <AdminPageAnalyticsSection ga4={ga4} />;
}
