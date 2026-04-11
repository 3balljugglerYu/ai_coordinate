import type { ReactNode } from "react";
import {
  Coins,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminDashboardModeTabs } from "./AdminDashboardModeTabs";
import { AdminDashboardRangeTabs } from "./AdminDashboardRangeTabs";
import { AdminKpiCard } from "./AdminKpiCard";
import { AdminOpsSummaryCard } from "./AdminOpsSummaryCard";
import { AdminPriorityAlertsCard } from "./AdminPriorityAlertsCard";
import { AdminQuickActionsGrid } from "./AdminQuickActionsGrid";
import { AdminRevenueChartPanel } from "./AdminRevenueChartPanel";
import { AdminRecentPurchasesTable } from "./AdminRecentPurchasesTable";
import type { AdminDashboardTab } from "../lib/dashboard-tab";
import type { AdminDashboardData } from "../lib/dashboard-types";

interface AdminDashboardViewProps {
  data: AdminDashboardData;
  currentTab: AdminDashboardTab;
  children?: ReactNode;
}

const kpiIconMap = {
  signups: { icon: UserPlus, tone: "violet" as const },
  generations: { icon: Sparkles, tone: "blue" as const },
  liveRevenue: { icon: Coins, tone: "emerald" as const },
  pendingModeration: { icon: ShieldCheck, tone: "amber" as const },
};

export function AdminDashboardView({
  data,
  currentTab,
  children,
}: AdminDashboardViewProps) {
  const description =
    currentTab === "one-tap-style"
      ? "One-Tap Style の利用状況、上限到達、スタイル別パフォーマンスを確認できます。"
      : "運営状況と主要KPIをまとめて確認できます。";

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
              {description}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 xl:items-end">
          <AdminDashboardModeTabs
            currentTab={currentTab}
            currentRange={data.range}
          />
          <AdminDashboardRangeTabs
            currentRange={data.range}
            currentTab={currentTab}
          />
          <p className="text-xs text-slate-500">
            最終更新 {new Date(data.updatedAt).toLocaleString("ja-JP")}
          </p>
        </div>
      </section>

      {currentTab === "all" ? (
        <>
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
                  売上トレンド
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AdminRevenueChartPanel data={data.revenueTrend} />
              </CardContent>
            </Card>
          </section>

          {children}

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
        </>
      ) : (
        children
      )}

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
