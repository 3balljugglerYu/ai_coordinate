"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
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

export interface StackedBarSeries<TData extends object = Record<string, unknown>> {
  dataKey: keyof TData & string;
  name: string;
  color: string;
}

interface ScrollingStackedBarChartProps<TData extends object> {
  data: TData[];
  xDataKey: keyof TData & string;
  yAxisDataKey: keyof TData & string;
  barSeries: StackedBarSeries<TData>[];
  tooltipContent: ReactElement;
  stackId?: string;
  height?: number;
  minChartWidth?: number;
  columnWidth?: number;
}

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

export function ScrollingStackedBarChart<TData extends object>({
  data,
  xDataKey,
  yAxisDataKey,
  barSeries,
  tooltipContent,
  stackId = "stack",
  height = 360,
  minChartWidth = 720,
  columnWidth = 56,
}: ScrollingStackedBarChartProps<TData>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const computedMinWidth = Math.max(minChartWidth, data.length * columnWidth);

  const maxValue = useMemo(
    () =>
      data.reduce((max, row) => {
        const value = Number(row[yAxisDataKey]) || 0;
        return Math.max(max, value);
      }, 0),
    [data, yAxisDataKey]
  );

  const yAxisTicks = useMemo(() => buildYAxisTicks(maxValue), [maxValue]);
  const yAxisDomain: [number, number] = [0, yAxisTicks[yAxisTicks.length - 1] ?? 1];

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const raf = requestAnimationFrame(() => {
      element.scrollLeft = element.scrollWidth;
    });

    return () => cancelAnimationFrame(raf);
  }, [computedMinWidth, data.length]);

  return (
    <div className="flex">
      <div className="w-16 shrink-0">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
            <XAxis dataKey={xDataKey} hide />
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
              dataKey={yAxisDataKey}
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
        <div style={{ minWidth: `${computedMinWidth}px` }}>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey={xDataKey}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748B", fontSize: 12 }}
                minTickGap={16}
              />
              <YAxis domain={yAxisDomain} ticks={yAxisTicks} hide />
              <Tooltip content={tooltipContent} />
              <Legend />
              {barSeries.map((series) => (
                <Bar
                  key={series.dataKey}
                  dataKey={series.dataKey}
                  name={series.name}
                  stackId={stackId}
                  fill={series.color}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
