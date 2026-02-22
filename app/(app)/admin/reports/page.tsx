import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { ReportsClient } from "./ReportsClient";

export default async function AdminReportsPage() {
  const user = await getUser();
  const adminUserIds = getAdminUserIds();

  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          通報一覧
        </h1>
        <p className="mt-1 text-slate-600">
          ユーザーからの投稿通報を確認できます。しきい値未達の通報も含めて表示します。
        </p>
      </header>

      <ReportsClient />
    </div>
  );
}
