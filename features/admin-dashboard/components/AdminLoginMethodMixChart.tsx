"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DashboardLoginMethodMixItem } from "../lib/dashboard-types";

// 色はエンティティ(プロバイダ)に固定で割り当てる。並び順で色を回さない。
// 全ペアの色覚多様性(CVD)分離を検証済みのセット。
const PROVIDER_COLORS: Record<string, string> = {
  google: "#3B82F6",
  email: "#047857",
  x: "#EC4899",
  other: "#F59E0B",
};

const FALLBACK_COLOR = PROVIDER_COLORS.other;

function providerColor(provider: string): string {
  return PROVIDER_COLORS[provider] ?? FALLBACK_COLOR;
}

interface AdminLoginMethodMixChartProps {
  data: DashboardLoginMethodMixItem[];
}

export default function AdminLoginMethodMixChart({
  data,
}: AdminLoginMethodMixChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500 sm:h-[320px]">
        ログイン方法のデータはありません。
      </div>
    );
  }

  const rangeItems = data.filter((item) => item.count > 0);
  const hasRangeSignups = rangeItems.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="h-[280px] w-full sm:h-[320px]">
        {hasRangeSignups ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rangeItems}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={108}
                paddingAngle={3}
              >
                {rangeItems.map((entry) => (
                  <Cell
                    key={entry.provider}
                    fill={providerColor(entry.provider)}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const numericValue =
                    typeof value === "number"
                      ? value
                      : Number(value ?? 0);

                  return [`${numericValue.toLocaleString("ja-JP")}人`, name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
            期間内の新規登録はありません。
          </div>
        )}
      </div>
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={item.provider}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: providerColor(item.provider) }}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {item.label}
                </p>
                <p className="text-xs text-slate-500">
                  期間内 {item.count.toLocaleString("ja-JP")}人 / 累計{" "}
                  {item.cumulativeCount.toLocaleString("ja-JP")}人 (
                  {item.cumulativeSharePct.toLocaleString("ja-JP")}%)
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
