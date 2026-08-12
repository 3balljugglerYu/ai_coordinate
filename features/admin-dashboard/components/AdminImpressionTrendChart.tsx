"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ImpressionDailyPoint } from "../lib/build-impression-stats";

interface AdminImpressionTrendChartProps {
  data: ImpressionDailyPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const total = payload
    .filter((item) => item.name !== "ユニーク視聴者")
    .reduce(
      (sum, item) => sum + (typeof item.value === "number" ? item.value : 0),
      0
    );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {payload.map((item) => (
          <p key={String(item.name)} style={{ color: item.color }}>
            {item.name}:{" "}
            {typeof item.value === "number"
              ? item.value.toLocaleString("ja-JP")
              : item.value}
          </p>
        ))}
        <p className="border-t border-slate-100 pt-1 font-semibold text-slate-900">
          合計: {total.toLocaleString("ja-JP")}
        </p>
      </div>
    </div>
  );
}

export default function AdminImpressionTrendChart({
  data,
}: AdminImpressionTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
        この期間のデータはありません。
      </div>
    );
  }

  // 表示形式の記録は 2026-08-12 開始。それ以前の行しかない期間で
  // 「不明」だけの積み上げを出しても意味がないので、0 のときは凡例ごと消す。
  const hasUnknown = data.some((point) => point.unknown > 0);

  return (
    <div className="h-[260px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          title="インプレッションの日別推移"
        >
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
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
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar
            dataKey="feed"
            name="フィード"
            stackId="impressions"
            fill="#2563EB"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="grid"
            name="グリッド"
            stackId="impressions"
            fill="#7C3AED"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="detail"
            name="投稿詳細"
            stackId="impressions"
            fill="#059669"
            radius={[0, 0, 0, 0]}
          />
          {hasUnknown ? (
            <Bar
              dataKey="unknown"
              name="不明(計測前)"
              stackId="impressions"
              fill="#CBD5E1"
              radius={[4, 4, 0, 0]}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="uniqueViewers"
            name="ユニーク視聴者"
            stroke="#E11D48"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
