"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { CollectionTrendPoint } from "../lib/build-collection-kpi";

const AdminCollectionTrendChart = dynamic(
  () => import("./AdminCollectionTrendChart"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        チャートを読み込み中...
      </div>
    ),
  }
);

interface AdminCollectionTrendChartPanelProps {
  data: CollectionTrendPoint[];
}

export function AdminCollectionTrendChartPanel({
  data,
}: AdminCollectionTrendChartPanelProps) {
  return (
    <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-violet-200 [&::-webkit-scrollbar-track]:bg-transparent md:overflow-visible md:pb-0">
      <div className="min-w-[680px] md:min-w-0">
        <AdminCollectionTrendChart data={data} />
      </div>
    </div>
  );
}
