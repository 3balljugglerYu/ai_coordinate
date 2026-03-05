"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ga4EntryAccessRow } from "@/features/analytics/lib/ga4-types";
import {
  ScrollingStackedBarChart,
  type StackedBarSeries,
} from "./ScrollingStackedBarChart";
import {
  buildEntryAccessChart,
  type EntryAccessChartRow,
} from "./charts/entry-access-chart.helpers";

interface AdminEntryAccessStackedCardProps {
  rows: Ga4EntryAccessRow[];
  dateKeys: string[];
}

function EntryAccessTooltip({
  active,
  payload,
  label,
  labelsByDataKey,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    dataKey?: string;
    payload?: EntryAccessChartRow;
  }>;
  label?: string;
  labelsByDataKey: Record<string, string>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const visibleItems = payload.filter((item) => Number(item.value ?? 0) > 0);
  const total =
    Number(payload[0]?.payload?.totalSessions ?? 0) ||
    visibleItems.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const fullDate = payload[0]?.payload?.dateKey ?? label;

  return (
    <div className="max-w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="break-all text-sm font-semibold text-slate-900">
        {fullDate}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        合計: {total.toLocaleString("ja-JP")}
      </p>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {visibleItems.map((item) => (
          <p key={String(item.dataKey)}>
            {labelsByDataKey[String(item.dataKey)] ?? item.name}:{" "}
            {Number(item.value ?? 0).toLocaleString("ja-JP")}
          </p>
        ))}
      </div>
    </div>
  );
}

export function AdminEntryAccessStackedCard({
  rows,
  dateKeys,
}: AdminEntryAccessStackedCardProps) {
  const { chartRows, barDefinitions, labelsByDataKey } =
    buildEntryAccessChart(rows, dateKeys);
  const series: StackedBarSeries<EntryAccessChartRow>[] = barDefinitions.map((bar) => ({
    dataKey: bar.dataKey,
    name: bar.legendLabel,
    color: bar.color,
  }));

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          日別入口ページアクセス（積み上げ）
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          日付ごとに、入口ページ上位6件とその他のアクセス構成を確認します（admin・localhost は除外）。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartRows.length === 0 || barDefinitions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
            日別入口ページアクセスのデータはまだありません。
          </div>
        ) : (
          <ScrollingStackedBarChart
            data={chartRows}
            xDataKey="dateLabel"
            yAxisDataKey="totalSessions"
            barSeries={series}
            stackId="access"
            tooltipContent={<EntryAccessTooltip labelsByDataKey={labelsByDataKey} />}
          />
        )}
      </CardContent>
    </Card>
  );
}
