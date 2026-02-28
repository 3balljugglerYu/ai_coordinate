import { Activity, ArrowRightLeft, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Ga4DashboardData } from "@/features/analytics/lib/ga4-types";
import { AdminTopLandingPagesCard } from "./AdminTopLandingPagesCard";
import { AdminTopPagesCard } from "./AdminTopPagesCard";

interface AdminPageAnalyticsSectionProps {
  ga4: Ga4DashboardData;
}

export function AdminPageAnalyticsSection({
  ga4,
}: AdminPageAnalyticsSectionProps) {
  if (ga4.status !== "ready") {
    return (
      <section className="space-y-4">
        <div>
          <h2
            className="text-lg font-semibold text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            ページ分析
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            GA4 の page_view と landing page を表示します。
          </p>
        </div>
        <Card className="border-violet-200/60 bg-white/95 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                <Info className="h-5 w-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {ga4.status === "disabled"
                    ? "GA4 の設定待ちです"
                    : "GA4 データの取得に失敗しました"}
                </p>
                <p className="text-sm leading-6 text-slate-600">
                  {ga4.statusMessage}
                </p>
                {ga4.transitionsPendingMessage ? (
                  <p className="text-sm leading-6 text-slate-500">
                    {ga4.transitionsPendingMessage}
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2
            className="text-lg font-semibold text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            ページ分析
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            GA4 の page_view と landing page を表示します。
          </p>
        </div>
        {ga4.transitionsPendingMessage ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
            {ga4.transitionsPendingMessage}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <AdminTopPagesCard rows={ga4.topPages} />
        </div>
        <div className="xl:col-span-6">
          <AdminTopLandingPagesCard rows={ga4.topLandingPages} />
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Activity className="h-4 w-4" aria-hidden />
        </div>
        <p className="leading-6">
          <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">
            Top Pages
          </code>{" "}
          は{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">
            pagePath / pageTitle / screenPageViews / activeUsers
          </code>
          、{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">
            Top Landing Pages
          </code>{" "}
          は{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">
            landingPagePlusQueryString / sessions / activeUsers
          </code>{" "}
          を基準にしています。
        </p>
      </div>
    </section>
  );
}

export function AdminPageAnalyticsSectionSkeleton() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2
            className="text-lg font-semibold text-slate-900"
            style={{
              fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
            }}
          >
            ページ分析
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            GA4 の page_view と landing page を表示します。
          </p>
        </div>
        <div className="h-8 w-64 rounded-full bg-slate-100" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="border-violet-200/60 bg-white/95 shadow-sm xl:col-span-6">
          <CardContent className="space-y-3 p-6">
            <div className="h-6 w-40 rounded bg-slate-100" />
            <div className="h-28 rounded-xl bg-slate-100" />
            <div className="h-28 rounded-xl bg-slate-100" />
          </CardContent>
        </Card>
        <Card className="border-violet-200/60 bg-white/95 shadow-sm xl:col-span-6">
          <CardContent className="space-y-3 p-6">
            <div className="h-6 w-44 rounded bg-slate-100" />
            <div className="h-28 rounded-xl bg-slate-100" />
            <div className="h-28 rounded-xl bg-slate-100" />
          </CardContent>
        </Card>
      </div>

      <div className="h-16 rounded-xl border border-slate-200/80 bg-slate-50/70" />
    </section>
  );
}
