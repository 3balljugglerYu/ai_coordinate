import { Suspense } from "react";
import { AdminDashboardView } from "@/features/admin-dashboard/components/AdminDashboardView";
import { AdminPageAnalyticsSectionSkeleton } from "@/features/admin-dashboard/components/AdminPageAnalyticsSection";
import { AdminPageAnalyticsSectionServer } from "@/features/admin-dashboard/components/AdminPageAnalyticsSectionServer";
import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import { parseDashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
import { getGa4DashboardData } from "@/features/analytics/lib/get-ga4-dashboard-data";
import { connection } from "next/server";

interface AdminDashboardPageProps {
  searchParams?: Promise<{ range?: string }>;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  await connection();

  const params = (await searchParams) ?? {};
  const range = parseDashboardRange(params.range);
  const ga4Promise = getGa4DashboardData(range);
  const data = await getAdminDashboardData(range);

  return (
    <AdminDashboardView data={data}>
      <Suspense fallback={<AdminPageAnalyticsSectionSkeleton />}>
        <AdminPageAnalyticsSectionServer ga4Promise={ga4Promise} />
      </Suspense>
    </AdminDashboardView>
  );
}
