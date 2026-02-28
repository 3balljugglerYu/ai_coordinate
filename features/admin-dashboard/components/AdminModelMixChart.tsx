"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DashboardModelMixItem } from "../lib/dashboard-types";

const COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#F97316"];

interface AdminModelMixChartProps {
  data: DashboardModelMixItem[];
}

export default function AdminModelMixChart({
  data,
}: AdminModelMixChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
        モデル別データはありません。
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="h-[280px] w-full sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="model"
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={108}
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.model}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => {
                const numericValue =
                  typeof value === "number"
                    ? value
                    : Number(value ?? 0);

                return [`${numericValue.toLocaleString("ja-JP")}件`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3">
        {data.map((item, index) => (
          <div
            key={item.model}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {item.model}
                </p>
                <p className="text-xs text-slate-500">
                  {item.count.toLocaleString("ja-JP")}件
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold text-slate-700">
              {item.sharePct.toLocaleString("ja-JP")}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
