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
import type { PopupBannerAnalyticsPoint } from "@/features/popup-banners/lib/schema";

interface PopupBannerAnalyticsChartProps {
  data: PopupBannerAnalyticsPoint[];
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

export function PopupBannerAnalyticsChart({
  data,
}: PopupBannerAnalyticsChartProps) {
  const hasAnyData = data.some(
    (point) =>
      point.impression > 0 ||
      point.click > 0 ||
      point.close > 0 ||
      point.dismiss_forever > 0
  );

  if (!hasAnyData) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
        この期間のアナリティクスデータはありません。
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full sm:h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          title="ポップアップバナーの日別アナリティクス"
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
            dataKey="impression"
            name="表示"
            stroke="#2563EB"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="click"
            name="クリック"
            stroke="#10B981"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="close"
            name="閉じる"
            stroke="#F59E0B"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="dismiss_forever"
            name="次回から非表示"
            stroke="#DC2626"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
