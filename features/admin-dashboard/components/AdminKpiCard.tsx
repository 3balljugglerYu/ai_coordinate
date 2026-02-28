import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AdminDashboardKpi } from "../lib/dashboard-types";

type Tone = "violet" | "blue" | "emerald" | "amber";

const toneStyles: Record<
  Tone,
  {
    iconBg: string;
    iconText: string;
    deltaText: string;
  }
> = {
  violet: {
    iconBg: "bg-violet-100",
    iconText: "text-violet-700",
    deltaText: "text-violet-700",
  },
  blue: {
    iconBg: "bg-blue-100",
    iconText: "text-blue-700",
    deltaText: "text-blue-700",
  },
  emerald: {
    iconBg: "bg-emerald-100",
    iconText: "text-emerald-700",
    deltaText: "text-emerald-700",
  },
  amber: {
    iconBg: "bg-amber-100",
    iconText: "text-amber-700",
    deltaText: "text-amber-700",
  },
};

interface AdminKpiCardProps {
  kpi: AdminDashboardKpi;
  icon: LucideIcon;
  tone: Tone;
}

export function AdminKpiCard({ kpi, icon: Icon, tone }: AdminKpiCardProps) {
  const toneStyle = toneStyles[tone];

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-600">{kpi.label}</p>
            <div className="space-y-1">
              <p
                className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl"
                style={{
                  fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
                }}
              >
                {kpi.value}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {kpi.deltaPct !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      toneStyle.deltaText
                    )}
                  >
                    {kpi.deltaDirection === "up" ? (
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    ) : kpi.deltaDirection === "down" ? (
                      <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {kpi.deltaPct.toLocaleString("ja-JP")}%
                  </span>
                ) : null}
                <span className="text-slate-500">{kpi.subtext}</span>
              </div>
            </div>
          </div>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12",
              toneStyle.iconBg,
              toneStyle.iconText
            )}
          >
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
