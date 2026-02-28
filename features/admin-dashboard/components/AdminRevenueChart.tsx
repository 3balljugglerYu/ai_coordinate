"use client";

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
import type {
  DashboardRevenueTrend,
} from "../lib/dashboard-types";

interface AdminRevenueChartProps {
  data: DashboardRevenueTrend;
}

function formatYAxis(value: number) {
  if (value >= 10000) {
    return `¥${Math.round(value / 1000)}k`;
  }

  return `¥${value.toLocaleString("ja-JP")}`;
}

function RevenueTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const rows = payload
    .map((item) => {
      const rawValue = item.value;
      const value =
        typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);

      return {
        label: item.name ?? "不明",
        value,
        color: item.color ?? "#94A3B8",
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-700">
        合計: ¥{total.toLocaleString("ja-JP")}
      </p>
      <div className="mt-2 space-y-1.5 text-sm text-slate-600">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              {row.label}
            </span>
            <span>¥{row.value.toLocaleString("ja-JP")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueLegend({
  payload,
}: {
  payload?: Array<{ value?: string; color?: string }>;
}) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
      {payload.map((item) => (
        <div key={item.value} className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color ?? "#94A3B8" }}
            aria-hidden
          />
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminRevenueChart({
  data,
}: AdminRevenueChartProps) {
  const hasRevenue =
    data.series.length > 0 &&
    data.points.some((point) => point.totalRevenueYen > 0);

  if (!hasRevenue) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[280px]">
        この期間の売上データはありません。
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full sm:h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.points}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          title="管理ダッシュボードの売上トレンド"
        >
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748B", fontSize: 12 }}
            minTickGap={24}
            tickMargin={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748B", fontSize: 12 }}
            tickFormatter={formatYAxis}
            width={52}
          />
          <Tooltip content={<RevenueTooltip />} />
          <Legend content={<RevenueLegend />} />
          {data.series.map((series, index) => (
            <Bar
              key={series.key}
              dataKey={(point: typeof data.points[number]) =>
                point.breakdown[series.key] ?? 0
              }
              name={series.label}
              stackId="revenue"
              fill={series.color}
              radius={index === data.series.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
