import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardFunnelStep } from "../lib/dashboard-types";

interface AdminFunnelCardProps {
  steps: DashboardFunnelStep[];
}

export function AdminFunnelCard({ steps }: AdminFunnelCardProps) {
  const maxUsers = Math.max(...steps.map((step) => step.users), 0);

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          コンバージョンファネル
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, index) => {
          const widthPct = maxUsers > 0 ? (step.users / maxUsers) * 100 : 0;

          return (
            <div key={step.label} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {index + 1}. {step.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {step.rateFromPrevious !== null
                      ? `前段比 ${step.rateFromPrevious.toLocaleString("ja-JP")}%`
                      : "最上段ステップ"}
                  </p>
                </div>
                <p
                  className="text-lg font-bold text-slate-900"
                  style={{
                    fontFamily:
                      "var(--font-admin-heading), ui-monospace, monospace",
                  }}
                >
                  {step.users.toLocaleString("ja-JP")}
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500 transition-[width] duration-300"
                  style={{ width: `${Math.max(widthPct, step.users > 0 ? 8 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
