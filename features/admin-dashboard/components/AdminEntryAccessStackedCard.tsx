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

interface AdminEntryAccessStackedCardProps {
  rows: Ga4EntryAccessRow[];
  dateKeys: string[];
}

const ENTRY_ACCESS_OTHER_BUCKET = "__other__";
const LANDING_PAGE_COLORS = [
  "#0EA5E9",
  "#F97316",
  "#16A34A",
  "#7C3AED",
  "#64748B",
  "#14B8A6",
  "#A855F7",
] as const;

type ChartRow = {
  dateKey: string;
  dateLabel: string;
  totalSessions: number;
  [key: string]: string | number;
};

type ChartBarDefinition = {
  dataKey: string;
  fullLabel: string;
  legendLabel: string;
  color: string;
};

function shortenPath(path: string, max = 28) {
  if (path.length <= max) {
    return path;
  }
  return `${path.slice(0, max - 1)}…`;
}

function formatDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function buildDateKeys(rows: Ga4EntryAccessRow[], dateKeys: string[]) {
  if (dateKeys.length > 0) {
    return dateKeys;
  }

  return Array.from(new Set(rows.map((row) => row.dateKey).filter(Boolean))).sort();
}

function buildEntryAccessChart(rows: Ga4EntryAccessRow[], dateKeys: string[]) {
  const totalsByLandingPage = new Map<string, number>();
  const sessionsByDate = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!row.dateKey) {
      continue;
    }

    const landingPage = row.landingPage || "/";
    const sessions = Math.max(0, Number(row.sessions) || 0);

    totalsByLandingPage.set(
      landingPage,
      (totalsByLandingPage.get(landingPage) ?? 0) + sessions
    );

    const dateMap =
      sessionsByDate.get(row.dateKey) ?? new Map<string, number>();
    dateMap.set(landingPage, (dateMap.get(landingPage) ?? 0) + sessions);
    sessionsByDate.set(row.dateKey, dateMap);
  }

  const sortedLandingPages = Array.from(totalsByLandingPage.keys()).sort(
    (a, b) => {
      if (a === ENTRY_ACCESS_OTHER_BUCKET) {
        return 1;
      }
      if (b === ENTRY_ACCESS_OTHER_BUCKET) {
        return -1;
      }

      const diff =
        (totalsByLandingPage.get(b) ?? 0) - (totalsByLandingPage.get(a) ?? 0);
      if (diff !== 0) {
        return diff;
      }

      return a.localeCompare(b);
    }
  );

  const barDefinitions: ChartBarDefinition[] = sortedLandingPages.map(
    (landingPage, index) => ({
      dataKey: `segment_${index}`,
      fullLabel:
        landingPage === ENTRY_ACCESS_OTHER_BUCKET
          ? "その他入口ページ"
          : landingPage,
      legendLabel:
        landingPage === ENTRY_ACCESS_OTHER_BUCKET
          ? "その他入口ページ"
          : shortenPath(landingPage, 20),
      color: LANDING_PAGE_COLORS[index % LANDING_PAGE_COLORS.length],
    })
  );

  const dataKeyByLandingPage = new Map(
    sortedLandingPages.map((landingPage, index) => [
      landingPage,
      `segment_${index}`,
    ])
  );

  const labelsByDataKey: Record<string, string> = {};
  for (const bar of barDefinitions) {
    labelsByDataKey[bar.dataKey] = bar.fullLabel;
  }

  const chartRows: ChartRow[] = buildDateKeys(rows, dateKeys).map((dateKey) => {
      const dateMap = sessionsByDate.get(dateKey) ?? new Map<string, number>();
      const row: ChartRow = {
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        totalSessions: 0,
      };

      for (const bar of barDefinitions) {
        row[bar.dataKey] = 0;
      }

      for (const [landingPage, sessions] of dateMap.entries()) {
        const dataKey = dataKeyByLandingPage.get(landingPage);
        if (!dataKey) {
          continue;
        }
        row[dataKey] = sessions;
        row.totalSessions += sessions;
      }

      return row;
    });

  return {
    chartRows,
    barDefinitions,
    labelsByDataKey,
  };
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
    payload?: ChartRow;
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
  const series: StackedBarSeries<ChartRow>[] = barDefinitions.map((bar) => ({
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
