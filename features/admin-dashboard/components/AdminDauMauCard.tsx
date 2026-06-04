import { Activity, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardDauMauSummary } from "../lib/dashboard-types";

interface AdminDauMauCardProps {
  dauMau: DashboardDauMauSummary;
}

function formatInt(value: number): string {
  return value.toLocaleString("ja-JP");
}

export function AdminDauMauCard({ dauMau }: AdminDauMauCardProps) {
  const { dau, mau, stickinessPct, trend } = dauMau;
  const maxCount = trend.reduce((max, point) => Math.max(max, point.count), 0);

  return (
    <Card className="border-violet-200/60 bg-white/95 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle
          className="flex items-center gap-2 text-lg text-slate-900"
          style={{
            fontFamily: "var(--font-admin-heading), ui-monospace, monospace",
          }}
        >
          <Users className="h-5 w-5 text-violet-600" aria-hidden />
          アクティブユーザー
        </CardTitle>
        <p className="text-xs text-slate-500">
          ログイン済みユーザーの生成アクティビティ(JST)。MAU は直近30日(当日含む)。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">DAU(本日)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {formatInt(dau)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">MAU(30日)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {formatInt(mau)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">継続率 DAU/MAU</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {stickinessPct === null ? "—" : `${stickinessPct}%`}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            日次アクティブ(直近30日)
          </p>
          <div
            className="flex h-16 items-end gap-0.5"
            role="img"
            aria-label="直近30日の日次アクティブユーザー推移"
          >
            {trend.map((point) => (
              <div
                key={point.bucket}
                className="flex-1 rounded-t bg-violet-400/70"
                style={{
                  height:
                    maxCount > 0
                      ? `${Math.max(
                          (point.count / maxCount) * 100,
                          point.count > 0 ? 6 : 0
                        )}%`
                      : "0%",
                }}
                title={`${point.label}: ${formatInt(point.count)}`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{trend[0]?.label}</span>
            <span>{trend[trend.length - 1]?.label}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
