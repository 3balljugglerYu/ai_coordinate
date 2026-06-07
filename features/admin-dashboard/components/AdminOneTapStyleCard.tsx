import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Eye,
  Heart,
  MousePointerClick,
  Sparkles,
  UserPlus,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  DashboardOneTapStyleAnalytics,
  DashboardOneTapStyleMetric,
} from "../lib/dashboard-types";
import { computeWardrobeConversionRatePct } from "../lib/build-one-tap-style-summary";
import { AdminOneTapStyleTrendChartPanel } from "./AdminOneTapStyleTrendChartPanel";

interface AdminOneTapStyleCardProps {
  analytics: DashboardOneTapStyleAnalytics;
}

const metricConfig: Record<
  DashboardOneTapStyleMetric["key"],
  {
    icon: typeof Eye;
    accentClassName: string;
    iconBgClassName: string;
  }
> = {
  visits: {
    icon: Eye,
    accentClassName: "text-blue-700",
    iconBgClassName: "bg-blue-100",
  },
  generations: {
    icon: Sparkles,
    accentClassName: "text-emerald-700",
    iconBgClassName: "bg-emerald-100",
  },
  signupClicks: {
    icon: MousePointerClick,
    accentClassName: "text-amber-700",
    iconBgClassName: "bg-amber-100",
  },
  signupCompletions: {
    icon: UserPlus,
    accentClassName: "text-violet-700",
    iconBgClassName: "bg-violet-100",
  },
  wardrobeSaveClicks: {
    icon: Heart,
    accentClassName: "text-rose-700",
    iconBgClassName: "bg-rose-100",
  },
  wardrobeSaveCompletions: {
    icon: BadgeCheck,
    accentClassName: "text-teal-700",
    iconBgClassName: "bg-teal-100",
  },
};

function formatRatePct(rate: number | null): string {
  return rate === null ? "—" : `${rate.toLocaleString("ja-JP")}%`;
}

function MetricDelta({
  metric,
  accentClassName,
}: {
  metric: DashboardOneTapStyleMetric;
  accentClassName: string;
}) {
  if (metric.deltaPct === null) {
    return (
      <span className={cn("text-xs font-medium uppercase tracking-[0.14em]", accentClassName)}>
        New
      </span>
    );
  }

  const Icon =
    metric.deltaDirection === "up"
      ? ArrowUpRight
      : metric.deltaDirection === "down"
        ? ArrowDownRight
        : ArrowRight;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", accentClassName)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {metric.deltaPct.toLocaleString("ja-JP")}%
    </span>
  );
}

export function AdminOneTapStyleCard({
  analytics,
}: AdminOneTapStyleCardProps) {
  const metricsByKey = new Map(
    analytics.summary.metrics.map((metric) => [metric.key, metric])
  );
  const saveClicks = metricsByKey.get("wardrobeSaveClicks");
  const saveCompletions = metricsByKey.get("wardrobeSaveCompletions");
  const conversionCurrent =
    saveClicks && saveCompletions
      ? computeWardrobeConversionRatePct(
          saveCompletions.currentCount,
          saveClicks.currentCount
        )
      : null;
  const conversionPrevious =
    saveClicks && saveCompletions
      ? computeWardrobeConversionRatePct(
          saveCompletions.previousCount,
          saveClicks.previousCount
        )
      : null;

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          One-Tap Style
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          対象期間の One-Tap Style 利用状況です。訪問、生成成功、新規登録CTAクリック、登録完了に加え、ゲスト保存（ログイン転換）の保存クリック・保存完了を前期間比較で確認できます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {analytics.summary.metrics.map((metric) => {
            const config = metricConfig[metric.key];
            const Icon = config.icon;

            return (
              <div
                key={metric.key}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-600">
                      {metric.label}
                    </p>
                    <p
                      className="text-2xl font-bold tracking-tight text-slate-950"
                      style={{
                        fontFamily:
                          "var(--font-admin-heading), ui-monospace, monospace",
                      }}
                    >
                      {metric.currentCount.toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                      config.iconBgClassName,
                      config.accentClassName
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <MetricDelta
                    metric={metric}
                    accentClassName={config.accentClassName}
                  />
                  <span className="text-xs text-slate-500">
                    前期間 {metric.previousCount.toLocaleString("ja-JP")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          data-testid="wardrobe-conversion-rate"
          className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200/70 bg-teal-50/60 px-4 py-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-slate-700">
              ゲスト保存転換率（保存完了 / 保存クリック）
            </p>
            <p className="text-xs text-slate-500">
              期間内の保存クリックに対する保存完了の割合（コホートずれを含む概算）
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight text-teal-700">
              {formatRatePct(conversionCurrent)}
            </p>
            <p className="text-xs text-slate-500">
              前期間 {formatRatePct(conversionPrevious)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3">
          <AdminOneTapStyleTrendChartPanel data={analytics.trend} />
        </div>
      </CardContent>
    </Card>
  );
}
