import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { getAdminUserIds } from "@/lib/env";
import { listAnalyticsExclusions } from "@/features/admin-dashboard/lib/analytics-exclusion-repository";
import { getOperatorUserIds } from "@/features/admin-dashboard/lib/get-operator-user-ids";
import { AnalyticsExclusionsClient } from "./AnalyticsExclusionsClient";

export default async function AdminAnalyticsExclusionsPage() {
  await connection();

  const user = await getUser();
  const adminUserIds = getAdminUserIds();
  if (!user || adminUserIds.length === 0 || !adminUserIds.includes(user.id)) {
    redirect("/");
  }

  const [exclusions, operatorUserIds] = await Promise.all([
    listAnalyticsExclusions(),
    getOperatorUserIds(),
  ]);
  // env と admin_users から入っている人(この画面では外せない)
  const listed = new Set(exclusions.map((e) => e.userId));
  const builtInCount = operatorUserIds.filter((id) => !listed.has(id)).length;

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          集計から除く
        </h1>
        <p className="mt-1 text-slate-600">
          ダッシュボードの集計から除くアカウント(内部の確認用・審査用など)を管理します。
          ここに入れた人は、ペルコイン・企画のタブと概要の数字から除かれます。
        </p>
        <p className="mt-1 text-sm text-slate-500">
          ほかに、運営の設定(環境変数・admin_users)から {builtInCount}人 を除いています(この画面では外せません)。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <AnalyticsExclusionsClient initialExclusions={exclusions} />
        </CardContent>
      </Card>
    </div>
  );
}
