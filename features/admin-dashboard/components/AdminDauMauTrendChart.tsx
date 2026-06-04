"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface DauMauTrendPoint {
  label: string;
  loggedIn: number;
  guest: number;
  unknown: number;
}

interface AdminDauMauTrendChartProps {
  data: DauMauTrendPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {payload.map((item) => (
          <p key={String(item.name)}>
            {item.name}:{" "}
            {typeof item.value === "number"
              ? item.value.toLocaleString("ja-JP")
              : item.value}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function AdminDauMauTrendChart({
  data,
}: AdminDauMauTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
        この期間のアクセスデータはありません。
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          title="日次アクセス（ログイン状態別）"
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
            width={36}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="loggedIn"
            name="ログイン"
            stroke="#7C3AED"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="guest"
            name="未ログイン"
            stroke="#2563EB"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="unknown"
            name="計測前/未取得"
            stroke="#94A3B8"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
