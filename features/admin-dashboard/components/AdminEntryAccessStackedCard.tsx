"use client";

import { useEffect, useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Ga4EntryAccessRow } from "@/features/analytics/lib/ga4-types";

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

function buildYAxisTicks(maxValue: number) {
  if (maxValue <= 0) {
    return [0, 1];
  }

  const roughStep = Math.max(1, Math.ceil(maxValue / 4));
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  const niceFactor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, niceFactor * magnitude);
  const niceMax = Math.ceil(maxValue / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= niceMax; value += step) {
    ticks.push(value);
  }

  return ticks.length > 1 ? ticks : [0, niceMax || 1];
}

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
  const minChartWidth = Math.max(720, chartRows.length * 56);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const maxValue = chartRows.reduce(
    (max, row) => Math.max(max, Number(row.totalSessions) || 0),
    0
  );
  const yAxisTicks = buildYAxisTicks(maxValue);
  const yAxisDomain: [number, number] = [
    0,
    yAxisTicks[yAxisTicks.length - 1] ?? 1,
  ];

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      element.scrollLeft = element.scrollWidth;
    });

    return () => cancelAnimationFrame(raf);
  }, [minChartWidth, chartRows.length]);

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
          <div className="flex">
            <div className="w-16 shrink-0">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={chartRows} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
                  <XAxis dataKey="dateLabel" hide />
                  <YAxis
                    domain={yAxisDomain}
                    ticks={yAxisTicks}
                    tickLine={{ stroke: "#94A3B8" }}
                    axisLine={{ stroke: "#94A3B8" }}
                    tick={{ fill: "#475569", fontSize: 12 }}
                    tickFormatter={(value: number) => value.toLocaleString("ja-JP")}
                    width={56}
                  />
                  <Bar
                    dataKey="totalSessions"
                    fill="transparent"
                    stroke="transparent"
                    isAnimationActive={false}
                    legendType="none"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div
              ref={scrollRef}
              className="flex-1 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-violet-200 [&::-webkit-scrollbar-track]:bg-transparent"
            >
              <div style={{ minWidth: `${minChartWidth}px` }}>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="dateLabel"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 12 }}
                      minTickGap={16}
                    />
                    <YAxis domain={yAxisDomain} ticks={yAxisTicks} hide />
                    <Tooltip
                      content={<EntryAccessTooltip labelsByDataKey={labelsByDataKey} />}
                    />
                    <Legend />
                    {barDefinitions.map((bar) => (
                      <Bar
                        key={bar.dataKey}
                        dataKey={bar.dataKey}
                        name={bar.legendLabel}
                        stackId="access"
                        fill={bar.color}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
