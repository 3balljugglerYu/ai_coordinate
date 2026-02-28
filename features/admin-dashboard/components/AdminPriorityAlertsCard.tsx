import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardAlertRow } from "../lib/dashboard-types";

interface AdminPriorityAlertsCardProps {
  alerts: DashboardAlertRow[];
}

function getSeverityClasses(severity: DashboardAlertRow["severity"]) {
  if (severity === "critical") {
    return "border-red-200 bg-red-50/90 text-red-700";
  }

  if (severity === "warning") {
    return "border-amber-200 bg-amber-50/90 text-amber-700";
  }

  return "border-blue-200 bg-blue-50/90 text-blue-700";
}

export function AdminPriorityAlertsCard({
  alerts,
}: AdminPriorityAlertsCardProps) {
  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          優先アラート
        </CardTitle>
      </CardHeader>
      <CardContent
        className="space-y-3"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "0 280px",
        }}
      >
        {alerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">
            現在の優先アラートはありません。
          </div>
        ) : (
          alerts.map((alert) => (
            <Link
              key={alert.id}
              href={alert.href}
              className="group block rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 transition-colors duration-200 hover:border-violet-200 hover:bg-white"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                    getSeverityClasses(alert.severity)
                  )}
                >
                  {alert.severity === "critical" ? (
                    <ShieldAlert className="h-5 w-5" aria-hidden />
                  ) : (
                    <AlertTriangle className="h-5 w-5" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {alert.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {alert.description}
                      </p>
                    </div>
                    <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 sm:block" />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
