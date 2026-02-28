import {
  Coins,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminDashboardRangeTabs } from "./AdminDashboardRangeTabs";
import { AdminFunnelCard } from "./AdminFunnelCard";
import { AdminKpiCard } from "./AdminKpiCard";
import { AdminModelMixChartPanel } from "./AdminModelMixChartPanel";
import { AdminOpsSummaryCard } from "./AdminOpsSummaryCard";
import { AdminPageAnalyticsSection } from "./AdminPageAnalyticsSection";
import { AdminPriorityAlertsCard } from "./AdminPriorityAlertsCard";
import { AdminQuickActionsGrid } from "./AdminQuickActionsGrid";
import { AdminRevenueChartPanel } from "./AdminRevenueChartPanel";
import { AdminRecentPurchasesTable } from "./AdminRecentPurchasesTable";
import { AdminTrendChartPanel } from "./AdminTrendChartPanel";
import type { AdminDashboardData } from "../lib/dashboard-types";

interface AdminDashboardViewProps {
  data: AdminDashboardData;
}

const kpiIconMap = {
  signups: { icon: UserPlus, tone: "violet" as const },
  generations: { icon: Sparkles, tone: "blue" as const },
  liveRevenue: { icon: Coins, tone: "emerald" as const },
  pendingModeration: { icon: ShieldCheck, tone: "amber" as const },
};

export function AdminDashboardView({ data }: AdminDashboardViewProps) {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-violet-700">
            admin analytics
          </p>
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl"
              style={{
                fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
              }}
            >
              管理ダッシュボード
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              運営状況と主要KPIをまとめて確認できます。
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <AdminDashboardRangeTabs currentRange={data.range} />
          <p className="text-xs text-slate-500">
            最終更新 {new Date(data.updatedAt).toLocaleString("ja-JP")}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((kpi) => {
          const config = kpiIconMap[kpi.key];
          return (
            <AdminKpiCard
              key={kpi.key}
              kpi={kpi}
              icon={config.icon}
              tone={config.tone}
            />
          );
        })}
      </section>

      <section>
        <Card className="border-violet-200/60 bg-white/95 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle
              className="text-lg text-slate-900"
              style={{
                fontFamily:
                  "var(--font-admin-heading), ui-monospace, monospace",
              }}
            >
              ユーザー・生成トレンド
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AdminTrendChartPanel data={data.trend} />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-violet-200/60 bg-white/95 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle
              className="text-lg text-slate-900"
              style={{
                fontFamily:
                  "var(--font-admin-heading), ui-monospace, monospace",
              }}
            >
              売上トレンド
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AdminRevenueChartPanel data={data.revenueTrend} />
          </CardContent>
        </Card>
      </section>

      <AdminPageAnalyticsSection ga4={data.ga4} />

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <AdminFunnelCard steps={data.funnel} />
        </div>
        <Card className="border-violet-200/60 bg-white/95 shadow-sm xl:col-span-6">
          <CardHeader className="pb-4">
            <CardTitle
              className="text-lg text-slate-900"
              style={{
                fontFamily:
                  "var(--font-admin-heading), ui-monospace, monospace",
              }}
            >
              モデル別構成
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AdminModelMixChartPanel data={data.modelMix} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <AdminRecentPurchasesTable purchases={data.recentPurchases} />
        </div>
        <div className="xl:col-span-5">
          <AdminPriorityAlertsCard alerts={data.alerts} />
        </div>
      </section>

      <section className="max-w-4xl">
        <AdminOpsSummaryCard opsSummary={data.opsSummary} />
      </section>

      <section className="space-y-4">
        <div>
          <h2
            className="text-lg font-semibold text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            クイックアクション
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            よく使う管理画面へすぐに移動できます。
          </p>
        </div>
        <AdminQuickActionsGrid actions={data.quickActions} />
      </section>
    </div>
  );
}
