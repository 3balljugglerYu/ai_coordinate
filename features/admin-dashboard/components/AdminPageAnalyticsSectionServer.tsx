import { Suspense } from "react";
import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";
import type { AiCostActuals } from "../lib/ai-cost-actual-types";
import { AdminAiCostActualRow } from "./AdminAiCostActualRow";
import type {
  DashboardAiCostEstimate,
  DashboardFunnelStep,
  DashboardLoginMethodMixItem,
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
  loginMethodMix: DashboardLoginMethodMixItem[];
  aiCostEstimate: DashboardAiCostEstimate;
  aiCostActualsPromise: Promise<AiCostActuals>;
}

interface AdminGa4SectionLoaderProps {
  ga4Promise: Promise<Ga4DashboardData>;
}

async function AdminAiCostActualLoader({
  actualsPromise,
}: {
  actualsPromise: Promise<AiCostActuals>;
}) {
  const actuals = await actualsPromise;
  return <AdminAiCostActualRow actuals={actuals} />;
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
  loginMethodMix,
  aiCostEstimate,
  aiCostActualsPromise,
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
        loginMethodMix={loginMethodMix}
        aiCostEstimate={aiCostEstimate}
        aiCostActualSlot={
          <Suspense fallback={null}>
            <AdminAiCostActualLoader actualsPromise={aiCostActualsPromise} />
          </Suspense>
        }
      />
      <Suspense fallback={<AdminPageAnalyticsDetailsSectionSkeleton />}>
        <AdminPageAnalyticsDetailsSectionLoader ga4Promise={ga4Promise} />
      </Suspense>
    </section>
  );
}
