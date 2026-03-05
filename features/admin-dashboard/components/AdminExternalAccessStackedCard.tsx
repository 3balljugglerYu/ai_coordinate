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
import type { Ga4ExternalAccessRow } from "@/features/analytics/lib/ga4-types";

interface AdminExternalAccessStackedCardProps {
  rows: Ga4ExternalAccessRow[];
}

type ChartRow = Ga4ExternalAccessRow & {
  dateLabel: string;
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
  const minChartWidth = Math.max(720, chartRows.length * 56);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const maxValue = chartRows.reduce(
    (max, row) => Math.max(max, Number(row.totalExternalSessions) || 0),
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
                    dataKey="totalExternalSessions"
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
                  <BarChart
                    data={chartRows}
                    margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="dateLabel"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#64748B", fontSize: 12 }}
                      minTickGap={16}
                    />
                    <YAxis domain={yAxisDomain} ticks={yAxisTicks} hide />
                    <Tooltip content={<ExternalAccessTooltip />} />
                    <Legend />
                    <Bar dataKey="xSessions" name="X" stackId="external" fill="#0EA5E9" />
                    <Bar
                      dataKey="campfireSessions"
                      name="CAMPFIRE"
                      stackId="external"
                      fill="#F97316"
                    />
                    <Bar
                      dataKey="searchSessions"
                      name="検索"
                      stackId="external"
                      fill="#16A34A"
                    />
                    <Bar
                      dataKey="otherExternalSessions"
                      name="その他外部"
                      stackId="external"
                      fill="#64748B"
                    />
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
