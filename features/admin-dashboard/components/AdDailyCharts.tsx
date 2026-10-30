"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildChartEventMarkers } from "../lib/chart-event-markers";
import { formatJstDateLabel } from "../lib/dashboard-range";
import {
  AD_PLATFORM_COLORS,
  AD_PLATFORM_LABELS,
  type AdPlatform,
} from "../lib/ad-stats/ad-stats-types";
import type { AdDailyChartRow } from "../lib/ad-stats/build-ad-charts";
import type { AdDailyChart } from "../lib/ad-stats/ad-stats-repository";
import { ChartEventMarkerList } from "./ChartEventMarkerList";

export interface AdDailyChartsProps {
  chart: AdDailyChart;
  platforms: AdPlatform[];
  /** 目印を選んだ広告があるか（無ければ登録のグラフの代わりに案内を出す） */
  hasSignupSources: boolean;
}

type SeriesKey = Exclude<keyof AdDailyChartRow, "day">;

const PANELS: Array<{
  title: string;
  unit: string;
  series: Record<AdPlatform, SeriesKey>;
}> = [
  { title: "使った額（円）", unit: "円", series: { meta: "metaSpend", x: "xSpend" } },
  { title: "クリック（回）", unit: "回", series: { meta: "metaClicks", x: "xClicks" } },
  { title: "登録（人）", unit: "人", series: { meta: "metaSignups", x: "xSignups" } },
];

/**
 * 日ごとの「使った額」「クリック」「登録」。単位が違うので、1つのグラフに軸を2本立てず、
 * 同じ日付の並びで3つに分けて縦に並べる。出来事の印は3つとも縦の点線で出し、番号は一番上だけに付ける。
 */
export default function AdDailyCharts({ chart, platforms, hasSignupSources }: AdDailyChartsProps) {
  const points = chart.rows.map((row) => ({ ...row, label: formatJstDateLabel(row.day) }));
  const markers = buildChartEventMarkers(chart.events, new Set(chart.rows.map((row) => row.day)));
  const eventsByDay = new Map(markers.map((marker) => [marker.day, marker.names]));
  const showSignups = hasSignupSources && chart.signupsAvailable;
  const panels = showSignups ? PANELS : PANELS.slice(0, 2);

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {platforms.map((platform) => (
          <span key={platform} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: AD_PLATFORM_COLORS[platform] }}
            />
            {AD_PLATFORM_LABELS[platform]}
          </span>
        ))}
        {markers.length > 0 ? <span>点線＝出来事の印</span> : null}
      </div>

      {panels.map((panel, index) => {
        const isFirst = index === 0;
        const isLast = index === panels.length - 1;
        return (
          <div key={panel.title}>
            <h4 className="text-xs font-semibold text-slate-600">{panel.title}</h4>
            <div className={isLast ? "h-[150px] w-full" : "h-[120px] w-full"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={points}
                  margin={{ top: isFirst ? 20 : 6, right: 12, left: 0, bottom: 0 }}
                  title={`日ごとの${panel.title}`}
                >
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    hide={!isLast}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    minTickGap={24}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    width={52}
                    allowDecimals={false}
                    tickFormatter={(value: number) => value.toLocaleString("ja-JP")}
                  />
                  <Tooltip
                    cursor={{ fill: "#F1F5F9" }}
                    formatter={(value, name) => [
                      `${Number(value).toLocaleString("ja-JP")}${panel.unit}`,
                      name,
                    ]}
                    labelFormatter={(label, payload) => {
                      const day = payload?.[0]?.payload?.day as string | undefined;
                      const names = day ? eventsByDay.get(day) : undefined;
                      return names ? `${label}（${names.join("・")}）` : String(label);
                    }}
                  />
                  {markers.map((marker) => (
                    <ReferenceLine
                      key={marker.day}
                      x={formatJstDateLabel(marker.day)}
                      stroke="#94A3B8"
                      strokeDasharray="4 4"
                      label={
                        isFirst
                          ? {
                              value: String(marker.number),
                              position: "top",
                              fill: "#475569",
                              fontSize: 11,
                              fontWeight: 700,
                            }
                          : undefined
                      }
                    />
                  ))}
                  {platforms.map((platform, platformIndex) => (
                    <Bar
                      key={platform}
                      dataKey={panel.series[platform]}
                      name={AD_PLATFORM_LABELS[platform]}
                      stackId="platform"
                      fill={AD_PLATFORM_COLORS[platform]}
                      stroke="#FFFFFF"
                      strokeWidth={1}
                      radius={platformIndex === platforms.length - 1 ? [3, 3, 0, 0] : 0}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}

      {!hasSignupSources ? (
        <p className="text-xs text-slate-500">広告に目印を選ぶと、日ごとの登録も出ます。</p>
      ) : !chart.signupsAvailable ? (
        <p className="text-xs text-red-700">
          日ごとの登録を読めませんでした。少し待ってから開き直してください。
        </p>
      ) : null}
      <ChartEventMarkerList markers={markers} />
      <p className="text-xs text-slate-400">
        登録は、広告の最後の日の7日後まで数えます。
        {chart.endsToday ? "右端の日（今日）は、途中までの数です。" : ""}
      </p>
    </div>
  );
}
