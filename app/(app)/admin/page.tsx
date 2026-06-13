import { AdminDashboardView } from "@/features/admin-dashboard/components/AdminDashboardView";
import {
  AdminCollectionsView,
  type AdminCollectionSeries,
} from "@/features/admin-dashboard/components/AdminCollectionsView";
import { AdminOneTapStyleFocusView } from "@/features/admin-dashboard/components/AdminOneTapStyleFocusView";
import { AdminPageAnalyticsSectionServer } from "@/features/admin-dashboard/components/AdminPageAnalyticsSectionServer";
import { parseAdminDashboardTab } from "@/features/admin-dashboard/lib/dashboard-tab";
import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import {
  formatAdminDateTimeLabel,
  getOneTapStyleRangeBounds,
  parseDashboardRange,
  parseOneTapStyleDashboardRange,
} from "@/features/admin-dashboard/lib/dashboard-range";
import { getGa4DashboardData } from "@/features/analytics/lib/get-ga4-dashboard-data";
import { connection } from "next/server";

interface AdminDashboardPageProps {
  searchParams?: Promise<{
    range?: string;
    tab?: string;
    styleRange?: string;
    styleFrom?: string;
    styleTo?: string;
  }>;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  await connection();

  const params = (await searchParams) ?? {};
  const range = parseDashboardRange(params.range);
  const tab = parseAdminDashboardTab(params.tab);
  const styleRange = parseOneTapStyleDashboardRange(params.styleRange);
  const oneTapStyleRangeBounds = getOneTapStyleRangeBounds({
    range: styleRange,
    from: params.styleFrom,
    to: params.styleTo,
  });
  const formattedStyleFrom = formatAdminDateTimeLabel(oneTapStyleRangeBounds.fromIso);
  const formattedStyleTo = formatAdminDateTimeLabel(oneTapStyleRangeBounds.toIso);
  const data = await getAdminDashboardData(range, oneTapStyleRangeBounds);

  let collectionSeries: AdminCollectionSeries[] = [];
  if (tab === "collections") {
    const categories = await listPresetCategories({ includeInactive: true });
    collectionSeries = categories
      .filter((c) => c.isCollectionSeries)
      .map((c) => ({
        key: c.key,
        displayName: c.displayNameJa,
        threshold: c.completionThreshold ?? 0,
      }));
  }

  return (
    <AdminDashboardView
      data={data}
      currentTab={tab}
      currentStyleRange={oneTapStyleRangeBounds.range}
      currentStyleFrom={oneTapStyleRangeBounds.fromIso}
      currentStyleTo={oneTapStyleRangeBounds.toIso}
    >
      {tab === "collections" ? (
        <AdminCollectionsView series={collectionSeries} currentRange={range} />
      ) : tab === "one-tap-style" ? (
        <AdminOneTapStyleFocusView
          analytics={data.oneTapStyleDetailed}
          currentRange={range}
          currentStyleRange={oneTapStyleRangeBounds.range}
          currentStyleFrom={oneTapStyleRangeBounds.fromIso}
          currentStyleTo={oneTapStyleRangeBounds.toIso}
          currentStyleFromLabel={formattedStyleFrom}
          currentStyleToLabel={formattedStyleTo}
        />
      ) : (
        <AdminPageAnalyticsSectionServer
          ga4Promise={getGa4DashboardData(range)}
          trend={data.trend}
          oneTapStyle={data.oneTapStyle}
          funnel={data.funnel}
          modelMix={data.modelMix}
        />
      )}
    </AdminDashboardView>
  );
}
