import { connection } from "next/server";
import { Card, CardContent } from "@/components/ui/card";
import { ensureAdminPage } from "@/lib/admin-page-guard";
import {
  getAdStatsOverview,
  type AdStatsOverview,
} from "@/features/admin-dashboard/lib/ad-stats/ad-stats-repository";
import { AdStatsClient } from "./AdStatsClient";

export default async function AdminAdStatsPage() {
  await connection();
  await ensureAdminPage();

  let overview: AdStatsOverview | null = null;
  try {
    overview = await getAdStatsOverview();
  } catch (error) {
    console.error("[admin ad-stats] load error:", error);
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
          広告の成果
        </h1>
        <p className="mt-1 text-slate-600">
          Meta と X の広告の書き出しを取り込み、広告の数字と、そこから来た人の登録・生成・投稿を並べて見ます。
        </p>
      </header>

      <Card className="overflow-hidden border-violet-200/60 bg-white/95 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <AdStatsClient overview={overview} />
        </CardContent>
      </Card>
    </div>
  );
}
