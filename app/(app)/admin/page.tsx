import { AdminDashboardView } from "@/features/admin-dashboard/components/AdminDashboardView";
import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import { parseDashboardRange } from "@/features/admin-dashboard/lib/dashboard-range";
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
  const data = await getAdminDashboardData(range);

  return <AdminDashboardView data={data} />;
}
