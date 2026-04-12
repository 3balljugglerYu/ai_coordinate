import { AdminDashboardView } from "@/features/admin-dashboard/components/AdminDashboardView";
import { AdminOneTapStyleFocusView } from "@/features/admin-dashboard/components/AdminOneTapStyleFocusView";
import { AdminPageAnalyticsSectionServer } from "@/features/admin-dashboard/components/AdminPageAnalyticsSectionServer";
import { parseAdminDashboardTab } from "@/features/admin-dashboard/lib/dashboard-tab";
import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import { parseDashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { getGa4DashboardData } from "@/features/analytics/lib/get-ga4-dashboard-data";
import { connection } from "next/server";

interface AdminDashboardPageProps {
  searchParams?: Promise<{ range?: string; tab?: string }>;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  await connection();

  const params = (await searchParams) ?? {};
  const range = parseDashboardRange(params.range);
  const tab = parseAdminDashboardTab(params.tab);
  const data = await getAdminDashboardData(range);

  return (
    <AdminDashboardView data={data} currentTab={tab}>
      {tab === "one-tap-style" ? (
        <AdminOneTapStyleFocusView analytics={data.oneTapStyleDetailed} />
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
