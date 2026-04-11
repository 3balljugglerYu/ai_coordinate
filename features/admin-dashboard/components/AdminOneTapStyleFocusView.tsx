import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Download,
  MousePointerClick,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  DashboardOneTapStyleDetailedAnalytics,
  DashboardOneTapStyleFocusMetric,
} from "../lib/dashboard-types";
import { AdminOneTapStyleCard } from "./AdminOneTapStyleCard";

interface AdminOneTapStyleFocusViewProps {
  analytics: DashboardOneTapStyleDetailedAnalytics;
}

const focusMetricConfig: Record<
  DashboardOneTapStyleFocusMetric["key"],
  {
    icon: typeof MousePointerClick;
    accentClassName: string;
    iconBgClassName: string;
  }
> = {
  attempts: {
    icon: MousePointerClick,
    accentClassName: "text-blue-700",
    iconBgClassName: "bg-blue-100",
  },
  successRate: {
    icon: Sparkles,
    accentClassName: "text-emerald-700",
    iconBgClassName: "bg-emerald-100",
  },
  downloadRate: {
    icon: Download,
    accentClassName: "text-amber-700",
    iconBgClassName: "bg-amber-100",
  },
  rateLimitedShare: {
    icon: AlertTriangle,
    accentClassName: "text-rose-700",
    iconBgClassName: "bg-rose-100",
  },
};

function MetricDelta({
  metric,
  accentClassName,
}: {
  metric: DashboardOneTapStyleFocusMetric;
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

function formatPercent(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  return `${value.toLocaleString("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function AdminOneTapStyleFocusView({
  analytics,
}: AdminOneTapStyleFocusViewProps) {
  return (
    <section className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {analytics.focusMetrics.map((metric) => {
          const config = focusMetricConfig[metric.key];
          const Icon = config.icon;

          return (
            <Card key={metric.key} className="border-violet-200/60 bg-white/95 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600">{metric.label}</p>
                    <p
                      className="text-2xl font-bold tracking-tight text-slate-950"
                      style={{
                        fontFamily:
                          "var(--font-admin-heading), ui-monospace, monospace",
                      }}
                    >
                      {metric.value}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                      config.iconBgClassName,
                      config.accentClassName
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <MetricDelta
                    metric={metric}
                    accentClassName={config.accentClassName}
                  />
                  <span className="text-xs text-slate-500">
                    前期間 {metric.previousValue}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">
                  {metric.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <AdminOneTapStyleCard analytics={analytics.analytics} />

      <section className="grid gap-4 xl:grid-cols-12">
        <Card className="border-violet-200/60 bg-white/95 shadow-sm xl:col-span-7">
          <CardHeader className="pb-4">
            <CardTitle
              className="text-lg text-slate-900"
              style={{
                fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
              }}
            >
              セグメント別の利用状況
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-600">
              ログイン前後で、試行数、生成成功率、上限到達率がどう違うかを比較できます。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {analytics.segments.map((segment) => (
              <div
                key={segment.authState}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {segment.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      訪問 {segment.visits.toLocaleString("ja-JP")} 件
                    </p>
                  </div>
                  <Badge variant="outline">
                    {segment.authState === "authenticated" ? "member" : "guest"}
                  </Badge>
                </div>
                <dl className="mt-4 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <dt>試行数</dt>
                    <dd className="font-medium">{segment.attempts.toLocaleString("ja-JP")} 回</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>生成数</dt>
                    <dd className="font-medium">{segment.generations.toLocaleString("ja-JP")} 件</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>ダウンロード数</dt>
                    <dd className="font-medium">{segment.downloads.toLocaleString("ja-JP")} 件</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>上限到達数</dt>
                    <dd className="font-medium">{segment.rateLimited.toLocaleString("ja-JP")} 件</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>生成成功率</dt>
                    <dd className="font-medium">{formatPercent(segment.successRatePct)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>ダウンロード率</dt>
                    <dd className="font-medium">{formatPercent(segment.downloadRatePct)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>上限到達率</dt>
                    <dd className="font-medium">{formatPercent(segment.rateLimitedSharePct)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-violet-200/60 bg-white/95 shadow-sm xl:col-span-5">
          <CardHeader className="pb-4">
            <CardTitle
              className="text-lg text-slate-900"
              style={{
                fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
              }}
            >
              運用サマリー
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-600">
              公開中スタイルの稼働状況と試行ボリュームを確認できます。
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {[
              {
                label: "公開中スタイル",
                value: analytics.operationalSummary.publishedPresetCount,
              },
              {
                label: "下書きスタイル",
                value: analytics.operationalSummary.draftPresetCount,
              },
              {
                label: "稼働スタイル",
                value: analytics.operationalSummary.activePresetCount,
              },
              {
                label: "生成ゼロの公開中",
                value: analytics.operationalSummary.zeroGenerationPublishedPresetCount,
              },
              {
                label: "ログイン試行数",
                value: analytics.operationalSummary.authenticatedAttemptCount,
              },
              {
                label: "未ログイン試行数",
                value: analytics.operationalSummary.guestAttemptCount,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4"
              >
                <p className="text-sm text-slate-600">{item.label}</p>
                <p
                  className="mt-2 text-2xl font-bold tracking-tight text-slate-950"
                  style={{
                    fontFamily:
                      "var(--font-admin-heading), ui-monospace, monospace",
                  }}
                >
                  {item.value.toLocaleString("ja-JP")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card className="border-violet-200/60 bg-white/95 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle
            className="text-lg text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            スタイル別パフォーマンス
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-600">
            生成数、保存率、ログイン成功率、上限到達数をスタイル別に比較できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    スタイル
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    生成
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    DL
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    DL率
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    ログイン試行
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    ログイン成功率
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    上限到達
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.presetPerformance.map((preset) => (
                  <tr
                    key={preset.presetId}
                    className={cn(
                      "text-slate-700",
                      preset.status === "published" && preset.generations === 0
                        ? "bg-amber-50/50"
                        : "bg-transparent"
                    )}
                  >
                    <td className="border-b border-slate-100 px-3 py-3 align-top">
                      <div className="flex min-w-[220px] items-start gap-2">
                        <span className="font-medium text-slate-900">{preset.title}</span>
                        <Badge
                          variant={
                            preset.status === "published" ? "default" : "secondary"
                          }
                        >
                          {preset.status === "published"
                            ? "公開"
                            : preset.status === "draft"
                              ? "下書き"
                              : "不明"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        生成構成比 {preset.generationSharePct.toLocaleString("ja-JP")}%
                      </p>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.generations.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.downloads.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {formatPercent(preset.downloadRatePct)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.authenticatedAttempts.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {formatPercent(preset.authenticatedSuccessRatePct)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.rateLimited.toLocaleString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {analytics.dormantPublishedPresetTitles.length > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950">
              <p className="font-medium">生成ゼロの公開中スタイル</p>
              <p className="mt-1">
                {analytics.dormantPublishedPresetTitles.join(" / ")}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        {analytics.insights.map((insight) => (
          <Card key={insight.id} className="border-violet-200/60 bg-white/95 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                    insight.severity === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : insight.severity === "warning"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-violet-100 text-violet-700"
                  )}
                >
                  {insight.severity === "success" ? (
                    <BadgeCheck className="h-5 w-5" aria-hidden />
                  ) : insight.severity === "warning" ? (
                    <AlertTriangle className="h-5 w-5" aria-hidden />
                  ) : (
                    <Sparkles className="h-5 w-5" aria-hidden />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-slate-900">
                    {insight.title}
                  </p>
                  <p className="text-sm leading-6 text-slate-600">
                    {insight.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </section>
  );
}
