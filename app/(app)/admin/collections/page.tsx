import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listPresetCategories } from "@/features/style-presets/lib/preset-category-repository";
import {
  AdminCollectionsView,
  type AdminCollectionSeries,
} from "@/features/admin-dashboard/components/AdminCollectionsView";

export const metadata = {
  title: "コレクション | Admin",
};

export default async function AdminCollectionsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const categories = await listPresetCategories({ includeInactive: true });
  const series: AdminCollectionSeries[] = categories
    .filter((c) => c.isCollectionSeries)
    .map((c) => ({
      key: c.key,
      displayName: c.displayNameJa,
      threshold: c.completionThreshold ?? 0,
    }));

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          コレクション
        </h1>
        <p className="mt-1 text-slate-600">
          シリーズ別の KPI と、誰がコンプリートしたか(達成者一覧)を確認できます。
        </p>
      </header>
      <AdminCollectionsView series={series} />
    </div>
  );
}
