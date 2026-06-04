import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Ga4DauRow } from "@/features/analytics/lib/ga4-types";
import { AdminDauMauTrendChartPanel } from "./AdminDauMauTrendChartPanel";
import type { DauMauTrendPoint } from "./AdminDauMauTrendChart";

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

function rowTotal(row: Ga4DauRow): number {
  return row.loggedIn + row.guest + row.unknown;
}

export function AdminDauMauCard({ dauRows, mau }: AdminDauMauCardProps) {
  const latestTotal =
    dauRows.length > 0 ? rowTotal(dauRows[dauRows.length - 1]!) : 0;
  const stickinessPct =
    mau > 0 ? Number(((latestTotal / mau) * 100).toFixed(1)) : null;

  const chartData: DauMauTrendPoint[] = dauRows.map((row) => ({
    label: formatDateLabel(row.dateKey),
    loggedIn: row.loggedIn,
    guest: row.guest,
    unknown: row.unknown,
  }));

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
          サイト訪問者数（GA4）。日次アクセスをログイン / 未ログイン別に表示します。MAU は直近30日の総アクセス（当日含む）。
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">DAU（本日・計）</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {formatInt(latestTotal)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs font-medium text-slate-500">MAU（30日・計）</p>
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
          <p className="mb-2 text-xs font-medium text-slate-500">
            日次アクセス（ログイン状態別）
          </p>
          <AdminDauMauTrendChartPanel data={chartData} />
          <p className="mt-2 text-[11px] leading-5 text-slate-400">
            ※「計測前/未取得」は logged_in 計測が行き渡る前の訪問。計測開始後は減っていきます。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
