"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { DauMauTrendPoint } from "./AdminDauMauTrendChart";

const AdminDauMauTrendChart = dynamic(
  () => import("./AdminDauMauTrendChart"),
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

interface AdminDauMauTrendChartPanelProps {
  data: DauMauTrendPoint[];
}

export function AdminDauMauTrendChartPanel({
  data,
}: AdminDauMauTrendChartPanelProps) {
  return (
    <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-violet-200 [&::-webkit-scrollbar-track]:bg-transparent md:overflow-visible md:pb-0">
      <div className="min-w-[640px] md:min-w-0">
        <AdminDauMauTrendChart data={data} />
      </div>
    </div>
  );
}
