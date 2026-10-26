"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { PercoinBalance } from "../lib/build-percoin-balance";

const AdminPercoinDailyFlowChart = dynamic(() => import("./AdminPercoinDailyFlowChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      チャートを読み込み中...
    </div>
  ),
});

export function AdminPercoinDailyFlowChartPanel({
  daily,
  events,
}: {
  daily: PercoinBalance["daily"];
  events: PercoinBalance["events"];
}) {
  return <AdminPercoinDailyFlowChart daily={daily} events={events} />;
}
