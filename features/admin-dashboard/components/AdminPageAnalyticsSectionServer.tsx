import { Suspense } from "react";
import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";
import type {
  DashboardFunnelStep,
  DashboardModelMixItem,
  DashboardOneTapStyleAnalytics,
  DashboardTrendPoint,
} from "../lib/dashboard-types";
import {
  AdminPageAnalyticsAccessSection,
  AdminPageAnalyticsAccessSectionSkeleton,
  AdminPageAnalyticsDetailsSection,
  AdminPageAnalyticsDetailsSectionSkeleton,
  AdminTrendAndFunnelSection,
} from "./AdminPageAnalyticsSection";

interface AdminPageAnalyticsSectionServerProps {
  ga4Promise: Promise<Ga4DashboardData>;
  trend: DashboardTrendPoint[];
  oneTapStyle: DashboardOneTapStyleAnalytics;
  funnel: DashboardFunnelStep[];
  modelMix: DashboardModelMixItem[];
}

interface AdminGa4SectionLoaderProps {
  ga4Promise: Promise<Ga4DashboardData>;
}

async function AdminPageAnalyticsAccessSectionLoader({
  ga4Promise,
}: AdminGa4SectionLoaderProps) {
  const ga4 = await ga4Promise;
  return <AdminPageAnalyticsAccessSection ga4={ga4} />;
}

async function AdminPageAnalyticsDetailsSectionLoader({
  ga4Promise,
}: AdminGa4SectionLoaderProps) {
  const ga4 = await ga4Promise;
  return <AdminPageAnalyticsDetailsSection ga4={ga4} />;
}

export function AdminPageAnalyticsSectionServer({
  ga4Promise,
  trend,
  oneTapStyle,
  funnel,
  modelMix,
}: AdminPageAnalyticsSectionServerProps) {
  return (
    <section className="space-y-4">
      <Suspense fallback={<AdminPageAnalyticsAccessSectionSkeleton />}>
        <AdminPageAnalyticsAccessSectionLoader ga4Promise={ga4Promise} />
      </Suspense>
      <AdminTrendAndFunnelSection
        trend={trend}
        oneTapStyle={oneTapStyle}
        funnel={funnel}
        modelMix={modelMix}
      />
      <Suspense fallback={<AdminPageAnalyticsDetailsSectionSkeleton />}>
        <AdminPageAnalyticsDetailsSectionLoader ga4Promise={ga4Promise} />
      </Suspense>
    </section>
  );
}
