"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ga4ExternalAccessRow } from "@/features/analytics/lib/ga4-types";
import {
  ScrollingStackedBarChart,
  type StackedBarSeries,
} from "./ScrollingStackedBarChart";

interface AdminExternalAccessStackedCardProps {
  rows: Ga4ExternalAccessRow[];
}

type ChartRow = Ga4ExternalAccessRow & {
  dateLabel: string;
};

const EXTERNAL_ACCESS_SERIES: StackedBarSeries<ChartRow>[] = [
  { dataKey: "xSessions", name: "X", color: "#0EA5E9" },
  { dataKey: "campfireSessions", name: "CAMPFIRE", color: "#F97316" },
  { dataKey: "searchSessions", name: "検索", color: "#16A34A" },
  { dataKey: "otherExternalSessions", name: "その他外部", color: "#64748B" },
];

function formatDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function ExternalAccessTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; payload?: ChartRow }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const chartRow = payload[0]?.payload;
  const total = Number(chartRow?.totalExternalSessions ?? 0);
  const fullDate = chartRow?.dateKey ?? label;
  const visibleItems = payload.filter((item) => Number(item.value ?? 0) > 0);

  return (
    <div className="max-w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{fullDate}</p>
      <p className="mt-1 text-xs text-slate-500">
        外部流入合計: {total.toLocaleString("ja-JP")}
      </p>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {visibleItems.map((item) => (
          <p key={String(item.name)}>
            {item.name}: {Number(item.value ?? 0).toLocaleString("ja-JP")}
          </p>
        ))}
      </div>
    </div>
  );
}

export function AdminExternalAccessStackedCard({
  rows,
}: AdminExternalAccessStackedCardProps) {
  const chartRows: ChartRow[] = rows.map((row) => ({
    ...row,
    dateLabel: formatDateLabel(row.dateKey),
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
          日別外部流入アクセス（積み上げ）
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          X / CAMPFIRE / 検索 / その他外部の流入を日別に確認します（admin・localhost・自サイト内・直接流入は除外）。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
            外部流入アクセスのデータはまだありません。
          </div>
        ) : (
          <ScrollingStackedBarChart
            data={chartRows}
            xDataKey="dateLabel"
            yAxisDataKey="totalExternalSessions"
            barSeries={EXTERNAL_ACCESS_SERIES}
            stackId="external"
            tooltipContent={<ExternalAccessTooltip />}
          />
        )}
      </CardContent>
    </Card>
  );
}
