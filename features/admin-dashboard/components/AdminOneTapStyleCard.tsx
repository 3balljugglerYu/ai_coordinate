import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Download,
  Eye,
  Sparkles,
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
  downloads: {
    icon: Download,
    accentClassName: "text-amber-700",
    iconBgClassName: "bg-amber-100",
  },
  rateLimited: {
    icon: AlertTriangle,
    accentClassName: "text-rose-700",
    iconBgClassName: "bg-rose-100",
  },
};

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
          対象期間の One-Tap Style 利用状況です。訪問、生成、ダウンロード、上限到達を前期間比較で確認できます。
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

        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3">
          <AdminOneTapStyleTrendChartPanel data={analytics.trend} />
        </div>
      </CardContent>
    </Card>
  );
}
