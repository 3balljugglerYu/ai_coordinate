import { Activity, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Ga4DauRow } from "@/features/analytics/lib/ga4-types";

interface AdminDauMauCardProps {
  dauRows: Ga4DauRow[];
  mau: number;
}

function formatInt(value: number): string {
  return value.toLocaleString("ja-JP");
}

function formatDateLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function AdminDauMauCard({ dauRows, mau }: AdminDauMauCardProps) {
  const latestDau =
    dauRows.length > 0 ? dauRows[dauRows.length - 1]!.dau : 0;
  const stickinessPct =
    mau > 0 ? Number(((latestDau / mau) * 100).toFixed(1)) : null;
  const maxCount = dauRows.reduce((max, row) => Math.max(max, row.dau), 0);

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
          アクセスユーザー（DAU / MAU）
        </CardTitle>
        <p className="text-xs text-slate-500">
          サイト訪問者数（GA4・全訪問者。現状ログイン/未ログインは区別しません）。MAU は直近30日（当日含む）。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">DAU（本日）</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {formatInt(latestDau)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">MAU（30日）</p>
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
            日次アクセス（選択期間）
          </p>
          {dauRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
              データはまだありません。
            </div>
          ) : (
            <>
              <div
                className="flex h-16 items-end gap-0.5"
                role="img"
                aria-label="選択期間の日次アクセスユーザー推移"
              >
                {dauRows.map((row) => (
                  <div
                    key={row.dateKey}
                    className="flex-1 rounded-t bg-violet-400/70"
                    style={{
                      height:
                        maxCount > 0
                          ? `${Math.max(
                              (row.dau / maxCount) * 100,
                              row.dau > 0 ? 6 : 0
                            )}%`
                          : "0%",
                    }}
                    title={`${formatDateLabel(row.dateKey)}: ${formatInt(row.dau)}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>{formatDateLabel(dauRows[0]!.dateKey)}</span>
                <span>
                  {formatDateLabel(dauRows[dauRows.length - 1]!.dateKey)}
                </span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
