import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Coins,
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
import { AdminOneTapStyleRangeControls } from "./AdminOneTapStyleRangeControls";
import type {
  DashboardOneTapStyleDetailedAnalytics,
  DashboardOneTapStyleFocusMetric,
} from "../lib/dashboard-types";
import type {
  DashboardRange,
  OneTapStyleDashboardRange,
} from "../lib/dashboard-range";
import { AdminOneTapStyleCard } from "./AdminOneTapStyleCard";

interface AdminOneTapStyleFocusViewProps {
  analytics: DashboardOneTapStyleDetailedAnalytics;
  currentRange: DashboardRange;
  currentStyleRange: OneTapStyleDashboardRange;
  currentStyleFrom: string | null;
  currentStyleTo: string | null;
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
  paidContinuations: {
    icon: Coins,
    accentClassName: "text-fuchsia-700",
    iconBgClassName: "bg-fuchsia-100",
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
  currentRange,
  currentStyleRange,
  currentStyleFrom,
  currentStyleTo,
}: AdminOneTapStyleFocusViewProps) {
  return (
    <section className="space-y-6">
      <AdminOneTapStyleRangeControls
        currentRange={currentRange}
        currentStyleRange={currentStyleRange}
        currentStyleFrom={currentStyleFrom}
        currentStyleTo={currentStyleTo}
      />

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

      <Card className="border-violet-200/60 bg-white/95 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle
            className="text-lg text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            /style 起点の新規登録ファネル
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-600">
            CTA クリックから登録完了、style 復帰、初回生成までを追っています。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {analytics.signupFunnel.steps.map((step) => (
              <div
                key={step.label}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4"
              >
                <p className="text-sm font-medium text-slate-600">{step.label}</p>
                <p
                  className="mt-2 text-2xl font-bold tracking-tight text-slate-950"
                  style={{
                    fontFamily:
                      "var(--font-admin-heading), ui-monospace, monospace",
                  }}
                >
                  {step.count.toLocaleString("ja-JP")}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {step.rateFromPrevious === null
                    ? "最上流ステップ"
                    : `前段階比 ${formatPercent(step.rateFromPrevious)}`}
                </p>
              </div>
            ))}
          </div>
          <dl className="grid gap-3 text-sm text-slate-700 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                CTA→登録完了率
              </dt>
              <dd className="mt-2 text-base font-semibold text-slate-900">
                {formatPercent(analytics.signupFunnel.clickToSignupRatePct)}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                登録後復帰率
              </dt>
              <dd className="mt-2 text-base font-semibold text-slate-900">
                {formatPercent(analytics.signupFunnel.signupReturnRatePct)}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
              <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                登録後初回生成率
              </dt>
              <dd className="mt-2 text-base font-semibold text-slate-900">
                {formatPercent(analytics.signupFunnel.signupGenerationRatePct)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

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
              ユーザー/ゲストで、生成開始回数、生成成功数、生成成功率、無料枠上限到達率、10ペルコイン継続の差を比較できます。
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
                    <dt>生成開始回数</dt>
                    <dd className="font-medium">{segment.attempts.toLocaleString("ja-JP")} 回</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>生成成功数</dt>
                    <dd className="font-medium">{segment.generations.toLocaleString("ja-JP")} 件</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>ダウンロード数</dt>
                    <dd className="font-medium">{segment.downloads.toLocaleString("ja-JP")} 件</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>無料枠上限到達数</dt>
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
                    <dt>無料枠上限到達率</dt>
                    <dd className="font-medium">{formatPercent(segment.rateLimitedSharePct)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>10ペルコイン継続数</dt>
                    <dd className="font-medium">{segment.paidGenerations.toLocaleString("ja-JP")} 件</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>10ペルコイン継続率</dt>
                    <dd className="font-medium">{formatPercent(segment.paidGenerationRatePct)}</dd>
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
                label: "ユーザー生成回数",
                value: analytics.operationalSummary.authenticatedAttemptCount,
              },
              {
                label: "ゲスト生成回数",
                value: analytics.operationalSummary.guestAttemptCount,
              },
              {
                label: "10ペルコイン継続数",
                value: analytics.operationalSummary.paidGenerationCount,
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
              生成数、保存率、投稿率、10ペルコイン継続数、ユーザー/ゲスト別の生成回数、ユーザー/ゲスト生成成功率をスタイル別に比較できます。
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
                    投稿
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    投稿率
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    10ペルコイン継続
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    10ペルコイン継続率
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    ユーザー生成回数
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    ゲスト生成回数
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    ユーザー生成成功率
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 font-medium">
                    ゲスト生成成功率
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
                      {preset.postedCount.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {formatPercent(preset.postRatePct)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.paidGenerations.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {formatPercent(preset.paidGenerationRatePct)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.authenticatedAttempts.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {preset.guestAttempts.toLocaleString("ja-JP")}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {formatPercent(preset.authenticatedSuccessRatePct)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      {formatPercent(preset.guestSuccessRatePct)}
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
