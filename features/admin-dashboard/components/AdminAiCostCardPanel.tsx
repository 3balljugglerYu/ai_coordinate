"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { DashboardAiCostEstimate } from "../lib/dashboard-types";

const AdminAiCostCard = dynamic(() => import("./AdminAiCostCard"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      チャートを読み込み中...
    </div>
  ),
});

interface AdminAiCostCardPanelProps {
  estimate: DashboardAiCostEstimate;
}

export function AdminAiCostCardPanel({ estimate }: AdminAiCostCardPanelProps) {
  return <AdminAiCostCard estimate={estimate} />;
}
