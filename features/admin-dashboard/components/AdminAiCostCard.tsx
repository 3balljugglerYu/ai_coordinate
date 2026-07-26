"use client";

import type { ReactNode } from "react";
import { Coins } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  DashboardAiCostDayPoint,
  DashboardAiCostEstimate,
} from "../lib/dashboard-types";
import { PROVIDER_CHART_COLORS } from "../lib/ai-cost-rates";
import {
  ScrollingStackedBarChart,
  type StackedBarSeries,
} from "./ScrollingStackedBarChart";

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function AiCostTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    dataKey?: string;
    payload?: DashboardAiCostDayPoint;
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const visibleItems = payload.filter((item) => Number(item.value ?? 0) > 0);

  return (
    <div className="max-w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-sm font-semibold text-slate-900">
        {point?.bucket ?? label}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        合計: {formatJpy(point?.totalJpy ?? 0)}
      </p>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {visibleItems.map((item) => (
          <p key={String(item.dataKey)}>
            {item.name}: {formatJpy(Number(item.value ?? 0))}
          </p>
        ))}
      </div>
    </div>
  );
}

interface AdminAiCostCardProps {
  estimate: DashboardAiCostEstimate;
  actualSlot?: ReactNode;
}

export default function AdminAiCostCard({
  estimate,
  actualSlot,
}: AdminAiCostCardProps) {
  const series: StackedBarSeries<DashboardAiCostDayPoint>[] = [
    {
      dataKey: "openaiJpy",
      name: "OpenAI",
      color: PROVIDER_CHART_COLORS.openai,
    },
    {
      dataKey: "googleJpy",
      name: "Google",
      color: PROVIDER_CHART_COLORS.google,
    },
  ];

  const hasCost = estimate.days.some((day) => day.totalJpy > 0);

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          AI 原価（推定）
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-600">
          画像生成モデルの単価 × 生成数による推定額です（{estimate.rateNote}）。
          テキスト生成など画像以外の API 利用は含みません。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <Coins className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs text-slate-500">期間内の推定コスト</p>
              <p className="text-2xl font-semibold text-slate-900">
                {formatJpy(estimate.totalJpy)}
              </p>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            {formatUsd(estimate.totalUsd)}
          </p>
          {estimate.unknownModelCount > 0 ? (
            <p className="text-xs text-slate-500">
              単価未設定 {estimate.unknownModelCount.toLocaleString("ja-JP")}
              件は金額に含みません
            </p>
          ) : null}
        </div>

        {actualSlot}

        {hasCost ? (
          <ScrollingStackedBarChart
            data={estimate.days}
            xDataKey="label"
            yAxisDataKey="totalJpy"
            barSeries={series}
            stackId="aiCost"
            tooltipContent={<AiCostTooltip />}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
            期間内に課金対象の生成はありません。
          </div>
        )}

        {estimate.byModel.length > 0 ? (
          <div className="space-y-2">
            {estimate.byModel.map((item) => (
              <div
                key={item.model}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor: PROVIDER_CHART_COLORS[item.provider],
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {item.model}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.providerLabel} ·{" "}
                      {item.count.toLocaleString("ja-JP")}件
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-700">
                  {formatJpy(item.totalJpy)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
