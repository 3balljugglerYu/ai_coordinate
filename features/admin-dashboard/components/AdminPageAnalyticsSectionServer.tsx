import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";
import type { AiCostActuals } from "../lib/ai-cost-actual-types";
import type { PostImpressionStats } from "../lib/get-post-impression-stats";
import { AdminAiCostActualRow } from "./AdminAiCostActualRow";
import { AdminImpressionSection } from "./AdminImpressionSection";
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
  impressionsPromise: Promise<PostImpressionStats>;
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

async function AdminImpressionSectionLoader({
  impressionsPromise,
}: {
  impressionsPromise: Promise<PostImpressionStats>;
}) {
  const stats = await impressionsPromise;
  return <AdminImpressionSection stats={stats} />;
}

function AdminImpressionSectionSkeleton() {
  return (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      インプレッションを集計中...
    </div>
  );
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
  impressionsPromise,
}: AdminPageAnalyticsSectionServerProps) {
  return (
    <section className="space-y-4">
      <Suspense fallback={<AdminPageAnalyticsAccessSectionSkeleton />}>
        <AdminPageAnalyticsAccessSectionLoader ga4Promise={ga4Promise} />
      </Suspense>
      {/*
        インプレッションは post_impressions を SQL で畳んで出す(GA4 とは別系統)。
        集計に時間がかかっても他のカードの表示を止めないよう Suspense で切る。
      */}
      <Suspense fallback={<AdminImpressionSectionSkeleton />}>
        <AdminImpressionSectionLoader impressionsPromise={impressionsPromise} />
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
