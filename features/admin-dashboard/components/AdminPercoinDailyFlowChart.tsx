"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatJstDateLabel } from "../lib/dashboard-range";
import type { PercoinBalance } from "../lib/build-percoin-balance";

interface AdminPercoinDailyFlowChartProps {
  daily: PercoinBalance["daily"];
  events: PercoinBalance["events"];
}

/**
 * 日ごとの「配った(無料)」と「使った(正味)」。出来事の印を縦の点線で出す。
 * 2本の線の上下で、配る方が多い日・使う方が多い日が分かる。
 */
export default function AdminPercoinDailyFlowChart({
  daily,
  events,
}: AdminPercoinDailyFlowChartProps) {
  if (daily.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        この期間の出入りはありません。
      </div>
    );
  }

  const points = daily.map((d) => ({ ...d, label: formatJstDateLabel(d.day) }));
  const days = new Set(daily.map((d) => d.day));
  // 同じ日の出来事は1本の線にまとめ、名前をつなぐ
  const eventsByDay = new Map<string, string[]>();
  for (const e of events) {
    if (!days.has(e.eventDate)) continue;
    eventsByDay.set(e.eventDate, [...(eventsByDay.get(e.eventDate) ?? []), e.title]);
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 28, right: 12, left: 0, bottom: 0 }}
          title="ペルコインの日ごとの出入り"
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
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [Number(value).toLocaleString("ja-JP"), name]}
            labelFormatter={(label, payload) => {
              const day = payload?.[0]?.payload?.day as string | undefined;
              const names = day ? eventsByDay.get(day) : undefined;
              return names ? `${label}(${names.join("・")})` : String(label);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {Array.from(eventsByDay.entries()).map(([day, names]) => (
            <ReferenceLine
              key={day}
              x={formatJstDateLabel(day)}
              stroke="#94A3B8"
              strokeDasharray="4 4"
              label={{
                value: names.length > 1 ? `${names[0]} ほか` : names[0],
                position: "insideTopLeft",
                fill: "#64748B",
                fontSize: 11,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="freeGranted"
            name="配った(無料)"
            stroke="#8B5CF6"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="netConsumed"
            name="使った(正味)"
            stroke="#F97316"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
